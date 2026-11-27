/**
 * Resolve a reader's blocks from the read-model.
 *
 * Blocks are mirrored into Postgres by `sync.server.ts` — the only place that
 * talks to a PDS, the AppView or Constellation about them. Every request path
 * reads them from here in SQL, so rendering a feed never costs a network call
 * to work out who the reader can't see.
 *
 * No `.server` suffix, deliberately: `reader/queries.ts` needs
 * {@link notBlockedByViewer} and is itself reachable from the client bundle, so
 * a server-only module here would fail import protection at build time. Nothing
 * in this file is server-only — the Drizzle client is threaded in by the
 * caller, exactly as in `queries.ts`.
 *
 * Four things block an account for a viewer, and all four are equal in effect:
 *
 * | Direction          | Record                                  | Held by |
 * | ------------------ | --------------------------------------- | ------- |
 * | `blocking`         | `app.bsky.graph.block`                  | viewer  |
 * | `blocked-by`       | `app.bsky.graph.block`                  | them    |
 * | `list-blocking`    | `app.bsky.graph.listblock` + `listitem` | viewer  |
 * | `list-blocked-by`  | `app.bsky.graph.listblock` + `listitem` | them    |
 *
 * That symmetry is the whole point: Bluesky hides content in both directions,
 * and a reader who blocked someone on Bluesky last year expects them to still
 * be gone here.
 *
 * **The allowlist is the one exception, and it lives here too.** A reader can
 * exempt specific accounts (`block_allowlist`, Settings → Blocked accounts): an
 * allowlisted account is not blocked for that reader in *any* direction, while
 * the block records stay untouched and keep applying on Bluesky. Both the edge
 * query ({@link blockEdgesAmong}) and the feed predicate
 * ({@link notBlockedByViewer}) fold the exemption into the same SQL, so every
 * surface built on them honours it without knowing it exists.
 *
 * **Bounded by the candidate set, never by the block set.** A reader who
 * subscribes to a large moderation blocklist blocks tens of thousands of
 * accounts, so "load the reader's blocks and filter in JS" is not an option.
 * Every helper here takes the DIDs a page is about to render and asks which of
 * *those* are blocked, which stays an index probe no matter how big the block
 * set is.
 */

import { inArray, sql } from "drizzle-orm";
import { cache as reactCache } from "react";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import type { BlockDirection, BlockEdge, BlockableCard } from "#/lib/blocks";
import {
  blockSubjectDids,
  mergeBlockEdges,
  rejectBlockedCards,
} from "#/lib/blocks";

export type { BlockDirection, BlockEdge };

/**
 * The DID authority of an AT-URI column, in SQL — the string half of
 * {@link uriAuthorityDid}.
 *
 * A publication's owner DID *is* the authority of its record URI, so a document
 * row can name its publication's owner without joining `publications` at all.
 * That matters where the owner check has to live inside a per-source lateral
 * that only has `documents` in scope, and it keeps the second block branch to a
 * string split rather than an extra join per candidate row.
 *
 * Yields NULL for a loose document (no publication), which then matches nothing.
 */
export function atUriAuthoritySql(
  uriExpr: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  return sql`nullif(split_part(${uriExpr}, '/', 3), '')`;
}

/** Read rows off a drizzle `db.execute` result (array or `{ rows }`). */
function executeRows<T>(result: unknown): Array<T> {
  if (Array.isArray(result)) return result as Array<T>;
  return ((result as { rows?: Array<T> }).rows ?? []) as Array<T>;
}

/**
 * The four block branches for `viewerDid`, narrowed to `dids`.
 *
 * Each branch is written so the narrowing sits on an indexed column, which is
 * what keeps this cheap for a reader on a 40k-member blocklist: Postgres probes
 * `(list_uri, subject_did)` for the handful of DIDs on the page instead of
 * expanding the list.
 */
function blockEdgeSql(
  schema: Schema,
  viewerDid: string,
  dids: ReadonlyArray<string>,
  {
    includeAllowlisted = false,
  }: {
    /**
     * Return edges for allowlisted accounts too. Only the settings listing wants
     * this — to say which block an exemption is overriding. Every enforcement
     * path leaves it off, so an allowlisted account simply has no edge.
     */
    includeAllowlisted?: boolean;
  } = {},
): ReturnType<typeof sql> {
  const b = schema.blocks;
  const bl = schema.blockLists;
  const bli = schema.blockListItems;
  const a = schema.blockAllowlist;
  const mutable = [...dids];
  const edges = sql`
    select ${b.subjectDid} as did, 'blocking' as direction, null as list_uri
      from ${b}
      where ${b.blockerDid} = ${viewerDid}
        and ${b.deleted} = false
        and ${inArray(b.subjectDid, mutable)}
    union all
    select ${b.blockerDid} as did, 'blocked-by' as direction, null as list_uri
      from ${b}
      where ${b.subjectDid} = ${viewerDid}
        and ${b.deleted} = false
        and ${inArray(b.blockerDid, mutable)}
    union all
    select ${bli.subjectDid} as did, 'list-blocking' as direction, ${bl.listUri} as list_uri
      from ${bli}
      join ${bl} on ${bl.listUri} = ${bli.listUri}
      where ${bl.blockerDid} = ${viewerDid}
        and ${bl.deleted} = false
        and ${inArray(bli.subjectDid, mutable)}
    union all
    select ${bl.blockerDid} as did, 'list-blocked-by' as direction, ${bl.listUri} as list_uri
      from ${bl}
      join ${bli} on ${bli.listUri} = ${bl.listUri}
      where ${bli.subjectDid} = ${viewerDid}
        and ${bl.deleted} = false
        and ${inArray(bl.blockerDid, mutable)}
  `;
  if (includeAllowlisted) return edges;
  // One primary-key probe per *blocked* candidate, never per candidate: the
  // union above has already narrowed to the accounts that are blocked.
  return sql`
    select edge.did, edge.direction, edge.list_uri
    from (${edges}) as edge
    where not exists(
      select 1 from ${a}
      where ${a.ownerDid} = ${viewerDid} and ${a.subjectDid} = edge.did
    )
  `;
}

/**
 * How long "does this reader block anybody?" is trusted in-process.
 *
 * Short, because the answer flipping false→true is a reader who just blocked
 * someone and expects them gone. Every write path calls
 * {@link invalidateBlockCache} anyway, so the TTL only covers blocks made
 * elsewhere and picked up by the sweep.
 */
const HAS_BLOCKS_TTL_MS = 60_000;

/**
 * Bound on the cache. Blocks are checked for every signed-in reader on every
 * request, so an unbounded map is a slow leak on a long-lived server; past this
 * the whole map is dropped rather than evicted one by one — the entries are a
 * single boolean each and re-earning them costs one indexed `EXISTS`.
 */
const HAS_BLOCKS_CACHE_MAX = 10_000;

const hasBlocksCache = new Map<string, { value: boolean; expires: number }>();

/**
 * Drop a reader's cached answer, after they block or unblock anything — or turn
 * {@link readerHasBlocks}'s `respect_blocks` switch on or off.
 */
export function invalidateBlockCache(did: string): void {
  hasBlocksCache.delete(did);
}

/**
 * Whether this viewer has any blocks at all, in either direction, *and* wants
 * them enforced.
 *
 * The guard in front of every other helper here, and in front of every SQL
 * predicate {@link notBlockedByViewer} would otherwise add — and the
 * overwhelmingly common answer is "no". That makes it the one place the
 * reader's "Hide blocked accounts" switch (`user.respect_blocks = false`) has
 * to land: answering "no" here turns off every feed predicate, post-filter,
 * blocked-page notice and digest filter at once, without any of them knowing
 * the setting exists. Push fan-out is the exception — it probes the block
 * tables for many recipients at once and checks the column itself.
 *
 * Cached two ways for that reason:
 * per-request via {@link reactCache} (one page filters several card sets), and
 * across requests in-process for {@link HAS_BLOCKS_TTL_MS}, so a signed-in
 * reader who has never blocked anybody costs nothing at all on the steady path.
 */
export const readerHasBlocks = reactCache(readerHasBlocksImpl);

async function readerHasBlocksImpl(
  db: Db,
  schema: Schema,
  viewerDid: string,
): Promise<boolean> {
  const cached = hasBlocksCache.get(viewerDid);
  if (cached && cached.expires > Date.now()) return cached.value;

  const b = schema.blocks;
  const bl = schema.blockLists;
  const bli = schema.blockListItems;
  const u = schema.user;
  // The opt-out rides on the same round trip, so a reader who turned blocks
  // off costs exactly what a reader with none does: one cached `false`.
  const result = await db.execute(sql`
    select (
      not exists(
        select 1 from ${u}
        where ${u.did} = ${viewerDid} and ${u.respectBlocks} = false
      )
      and (
        exists(
          select 1 from ${b}
          where (${b.blockerDid} = ${viewerDid} or ${b.subjectDid} = ${viewerDid})
            and ${b.deleted} = false
        )
        or exists(
          select 1 from ${bl}
          where ${bl.blockerDid} = ${viewerDid} and ${bl.deleted} = false
        )
        or exists(
          select 1 from ${bli}
          join ${bl} on ${bl.listUri} = ${bli.listUri}
          where ${bli.subjectDid} = ${viewerDid} and ${bl.deleted} = false
        )
      )
    ) as has
  `);
  const value = executeRows<{ has: boolean }>(result)[0]?.has ?? false;

  if (hasBlocksCache.size >= HAS_BLOCKS_CACHE_MAX) hasBlocksCache.clear();
  hasBlocksCache.set(viewerDid, {
    value,
    expires: Date.now() + HAS_BLOCKS_TTL_MS,
  });
  return value;
}

/**
 * The DID to hand a query builder's `viewerDid`, or `undefined` to leave the
 * query alone.
 *
 * **The only supported way to reach {@link notBlockedByViewer} from a feed.**
 * That predicate is three correlated `NOT EXISTS` evaluated per candidate row,
 * and on the follow feed it lands inside a per-source lateral whose whole job is
 * an indexed top-k scan (see the strategy note in `reader/queries.ts`). Paying
 * that for every signed-in reader — the vast majority of whom block nobody —
 * would regress the feed for everyone to serve a minority. So the predicate is
 * added only once we know it can actually match, which the cached
 * {@link readerHasBlocks} answers without a round trip on the steady path.
 */
export async function blockFilterDid(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
): Promise<string | undefined> {
  if (!viewerDid) return undefined;
  return (await readerHasBlocks(db, schema, viewerDid)) ? viewerDid : undefined;
}

/**
 * Which of `dids` are blocked for `viewerDid`, with the reason for each.
 *
 * One row per account, collapsed to the most actionable direction (see
 * `mergeBlockEdges`) so a card that is both blocked *and* blocking explains
 * itself as the block the reader can undo.
 */
export async function blockEdgesAmong(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  dids: ReadonlyArray<string>,
): Promise<Map<string, BlockEdge>> {
  if (!viewerDid) return new Map();
  const candidates = [...new Set(dids)].filter(
    (did) => did.startsWith("did:") && did !== viewerDid,
  );
  if (candidates.length === 0) return new Map();
  if (!(await readerHasBlocks(db, schema, viewerDid))) return new Map();

  const result = await db.execute(blockEdgeSql(schema, viewerDid, candidates));
  const rows = executeRows<{
    did: string;
    direction: BlockDirection;
    list_uri: string | null;
  }>(result);
  return mergeBlockEdges(
    rows.map((row) => ({
      did: row.did,
      direction: row.direction,
      listUri: row.list_uri,
    })),
  );
}

/** Which of `dids` are blocked for `viewerDid`, without the reason. */
export async function blockedDidsAmong(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  dids: ReadonlyArray<string>,
): Promise<Set<string>> {
  const edges = await blockEdgesAmong(db, schema, viewerDid, dids);
  return new Set(edges.keys());
}

/** The block between the viewer and one account, or null if there is none. */
export async function blockEdgeFor(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  did: string,
): Promise<BlockEdge | null> {
  const edges = await blockEdgesAmong(db, schema, viewerDid, [did]);
  return edges.get(did) ?? null;
}

/**
 * The first block between the viewer and any of `dids`, or null.
 *
 * For a page that renders several accounts at once — a document has an author
 * *and* a publication owner — where a block on any of them withholds the whole
 * thing. Order follows `dids`, so callers list the account they'd rather
 * explain first.
 */
export async function firstBlockAmong(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  dids: Array<string | null | undefined>,
): Promise<BlockEdge | null> {
  const candidates: Array<string> = [];
  for (const did of dids) {
    if (did) candidates.push(did);
  }
  if (candidates.length === 0) return null;
  const edges = await blockEdgesAmong(db, schema, viewerDid, candidates);
  for (const did of candidates) {
    const edge = edges.get(did);
    if (edge) return edge;
  }
  return null;
}

/**
 * The block between the viewer and one account, split by whether the viewer's
 * allowlist overrides it — one round trip for both.
 *
 * `block` is what enforcement sees (null when allowlisted); `overridden` is the
 * block an allowlist entry is currently setting aside, so a profile can offer
 * "Hide again" rather than a Block button that would write a second record for
 * an account that is already blocked.
 *
 * Gated like every other helper here: a reader with no blocks in effect (or
 * with enforcement off) gets nulls without a query.
 */
export async function blockStateFor(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  did: string,
): Promise<{ block: BlockEdge | null; overridden: BlockEdge | null }> {
  const none = { block: null, overridden: null };
  if (!viewerDid || did === viewerDid || !did.startsWith("did:")) return none;
  if (!(await readerHasBlocks(db, schema, viewerDid))) return none;

  const a = schema.blockAllowlist;
  const result = await db.execute(sql`
    select
      edge.did,
      edge.direction,
      edge.list_uri,
      exists(
        select 1 from ${a}
        where ${a.ownerDid} = ${viewerDid} and ${a.subjectDid} = edge.did
      ) as allowed
    from (${blockEdgeSql(schema, viewerDid, [did], { includeAllowlisted: true })}) as edge
  `);
  const rows = executeRows<{
    did: string;
    direction: BlockDirection;
    list_uri: string | null;
    allowed: boolean;
  }>(result);
  const edge = mergeBlockEdges(
    rows.map((row) => ({
      did: row.did,
      direction: row.direction,
      listUri: row.list_uri,
    })),
  ).get(did);
  if (!edge) return none;
  // One account, so the exemption is all-or-nothing across its edges.
  return rows[0]?.allowed
    ? { block: null, overridden: edge }
    : { block: edge, overridden: null };
}

/** Whether the viewer and this account are blocked from each other. */
export async function isBlockedForViewer(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  did: string | null | undefined,
): Promise<boolean> {
  if (!did) return false;
  return (await blockEdgeFor(db, schema, viewerDid, did)) !== null;
}

/**
 * Drop every card whose author (or publication owner) the viewer is blocked
 * from. The general-purpose filter: pair it with {@link notBlockedByViewer}
 * on paginated feeds, and use it alone for rails and third-party content.
 */
export async function filterBlockedCards<T extends BlockableCard>(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  cards: Array<T>,
): Promise<Array<T>> {
  if (!viewerDid || cards.length === 0) return cards;
  const blocked = await blockedDidsAmong(
    db,
    schema,
    viewerDid,
    blockSubjectDids(cards),
  );
  return rejectBlockedCards(cards, blocked);
}

/** {@link filterBlockedCards} for a plain list of account DIDs. */
export async function filterBlockedDids(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  dids: Array<string>,
): Promise<Array<string>> {
  if (!viewerDid || dids.length === 0) return dids;
  const blocked = await blockedDidsAmong(db, schema, viewerDid, dids);
  return blocked.size === 0 ? dids : dids.filter((did) => !blocked.has(did));
}

/**
 * `NOT EXISTS` predicate excluding accounts blocked for `viewerDid`, for use
 * inside a paginated query. Accounts on the viewer's allowlist pass it, block
 * or no block.
 *
 * Post-filtering a page is fine for a rail (see {@link filterBlockedCards}) but
 * wrong for a feed: dropping rows *after* `LIMIT` shortens the page and, on a
 * reader who blocks a large list, can empty it entirely while more results wait
 * behind the offset. `didExpr` is the outer author-DID column to correlate on
 * (e.g. `sql`"documents"."did"``).
 *
 * The list branches use `EXISTS` over the join rather than an `IN` expansion so
 * a 40k-member blocklist stays an index probe per candidate row.
 *
 * **Never pass a raw session DID here.** Resolve it through
 * {@link blockFilterDid} first: this is three correlated subqueries per
 * candidate row, and adding them for a reader who blocks nobody costs the whole
 * feed to serve an empty result set.
 */
export function notBlockedByViewer(
  schema: Schema,
  viewerDid: string,
  didExpr: ReturnType<typeof sql>,
  /**
   * A second account the row renders, checked the same way — for documents,
   * the owner of the publication they were published into. A guest post by an
   * account the reader is fine with, in a publication whose owner they block,
   * carries that owner in the byline and must not survive the filter.
   *
   * `null` at runtime (a loose document with no publication) simply never
   * matches, so the branch costs an index probe that finds nothing.
   */
  ownerDidExpr?: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  if (ownerDidExpr) {
    return sql`(${notBlockedByViewer(schema, viewerDid, didExpr)} and ${notBlockedByViewer(schema, viewerDid, ownerDidExpr)})`;
  }
  const b = schema.blocks;
  const bl = schema.blockLists;
  const bli = schema.blockListItems;
  const a = schema.blockAllowlist;
  // The allowlist branch sits *after* the block check in the `or`, so it is
  // only probed for a row that is actually blocked — the common unblocked row
  // short-circuits on the first operand and pays nothing extra.
  return sql`(not (
    exists(
      select 1 from ${b}
      where ${b.deleted} = false
        and (
          (${b.blockerDid} = ${viewerDid} and ${b.subjectDid} = ${didExpr})
          or (${b.subjectDid} = ${viewerDid} and ${b.blockerDid} = ${didExpr})
        )
    )
    or exists(
      select 1 from ${bli}
      join ${bl} on ${bl.listUri} = ${bli.listUri}
      where ${bl.blockerDid} = ${viewerDid}
        and ${bl.deleted} = false
        and ${bli.subjectDid} = ${didExpr}
    )
    or exists(
      select 1 from ${bl}
      join ${bli} on ${bli.listUri} = ${bl.listUri}
      where ${bli.subjectDid} = ${viewerDid}
        and ${bl.deleted} = false
        and ${bl.blockerDid} = ${didExpr}
    )
  ) or exists(
    select 1 from ${a}
    where ${a.ownerDid} = ${viewerDid} and ${a.subjectDid} = ${didExpr}
  ))`;
}

// ── Settings surfaces ───────────────────────────────────────────────────────

/** A blocked account as rendered in the moderation settings list. */
export interface BlockedAccountRow {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  direction: BlockDirection;
  /** The moderation list responsible, for the list-sourced directions. */
  listUri: string | null;
  /** The block record's AT-URI — present (and removable) only when outgoing. */
  uri: string | null;
  createdAt: string | null;
}

/**
 * The reader's own direct blocks, newest first, joined to whatever profile we
 * have mirrored.
 *
 * Deliberately *only* the outgoing direct blocks: this list is the reader's own
 * decisions, which they can undo here. Accounts blocking them, and members of
 * blocklists they subscribe to, are not theirs to edit and are surfaced
 * separately (see {@link readerBlockLists}) rather than mixed in as though they
 * were.
 */
export async function readerBlockedAccounts(
  db: Db,
  schema: Schema,
  viewerDid: string,
  opts: { limit: number; offset?: number },
): Promise<Array<BlockedAccountRow>> {
  const b = schema.blocks;
  const p = schema.profiles;
  const result = await db.execute(sql`
    select
      ${b.subjectDid} as did,
      ${b.uri} as uri,
      ${b.createdAt} as created_at,
      ${p.handle} as handle,
      ${p.displayName} as display_name,
      ${p.avatarUrl} as avatar_url
    from ${b}
    left join ${p} on ${p.did} = ${b.subjectDid}
    where ${b.blockerDid} = ${viewerDid} and ${b.deleted} = false
    order by ${b.createdAt} desc nulls last, ${b.uri} desc
    limit ${opts.limit} offset ${opts.offset ?? 0}
  `);
  const rows = executeRows<{
    did: string;
    uri: string;
    created_at: Date | string | null;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
  }>(result).map((row) => ({
    did: row.did,
    uri: row.uri,
    handle: row.handle,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    direction: "blocking" as const,
    listUri: null,
    createdAt: toIso(row.created_at),
  }));

  return hydrateBlockedAccounts(rows);
}

/**
 * Fill in identity for blocked accounts the read-model has never seen.
 *
 * `profiles` only holds accounts this app indexes — publishers, and readers who
 * signed in. A reader's blocks are mostly neither, so the left join above comes
 * back empty for them and the row has nothing to render but a `did:plc:…`
 * string. A moderation list of raw DIDs is unusable: the reader can't tell who
 * they blocked, let alone decide whether to undo it.
 *
 * So anything the mirror can't name is resolved from the public AppView, in one
 * batched call for the whole page. Best-effort by construction — a DID that
 * can't be resolved (deactivated, deleted, AppView down) still renders, just as
 * bare as before. Merged at read time rather than written back into `profiles`,
 * matching `resolveAuthorProfile`: these are accounts we deliberately don't
 * index, and a block shouldn't quietly enrol one into the read-model.
 */
async function hydrateBlockedAccounts<
  T extends {
    did: string;
    handle: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  },
>(rows: Array<T>): Promise<Array<T>> {
  const missing = rows.filter(
    (row) => !row.handle && !row.displayName && !row.avatarUrl,
  );
  if (missing.length === 0) return rows;

  const { fetchBlueskyPublicProfiles } =
    await import("#/lib/bluesky-public-profile");
  const fetched = await fetchBlueskyPublicProfiles(
    missing.map((row) => row.did),
  );
  if (fetched.size === 0) return rows;

  return rows.map((row) => {
    const profile = fetched.get(row.did);
    if (!profile) return row;
    return {
      ...row,
      handle: row.handle ?? profile.handle,
      displayName: row.displayName ?? profile.displayName,
      avatarUrl: row.avatarUrl ?? profile.avatarUrl,
    };
  });
}

// ── Allowlist ───────────────────────────────────────────────────────────────

/**
 * Cap on the allowlist, per reader. Generous for its purpose — a handful of
 * writers someone still wants to read — while keeping the settings listing a
 * single unpaginated read and the table from becoming somebody's scratchpad.
 */
export const BLOCK_ALLOWLIST_MAX = 500;

/** An allowlisted account as rendered in the moderation settings. */
export interface BlockAllowlistRow {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
  /**
   * The block this exemption is currently overriding, or null when there is
   * none any more (the block was undone, or the account was allowlisted ahead
   * of one). Said in the row so the reader knows what they're overriding —
   * especially for list and incoming blocks, which they never made themselves.
   */
  block: BlockEdge | null;
}

/** The reader's allowlist, newest first, with the block each entry overrides. */
export async function readerBlockAllowlist(
  db: Db,
  schema: Schema,
  viewerDid: string,
): Promise<Array<BlockAllowlistRow>> {
  const a = schema.blockAllowlist;
  const p = schema.profiles;
  const result = await db.execute(sql`
    select
      ${a.subjectDid} as did,
      ${a.createdAt} as created_at,
      ${p.handle} as handle,
      ${p.displayName} as display_name,
      ${p.avatarUrl} as avatar_url
    from ${a}
    left join ${p} on ${p.did} = ${a.subjectDid}
    where ${a.ownerDid} = ${viewerDid}
    order by ${a.createdAt} desc, ${a.subjectDid}
    limit ${BLOCK_ALLOWLIST_MAX}
  `);
  const rows = executeRows<{
    did: string;
    created_at: Date | string | null;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
  }>(result);
  if (rows.length === 0) return [];

  const edgeResult = await db.execute(
    blockEdgeSql(
      schema,
      viewerDid,
      rows.map((row) => row.did),
      { includeAllowlisted: true },
    ),
  );
  const edges = mergeBlockEdges(
    executeRows<{
      did: string;
      direction: BlockDirection;
      list_uri: string | null;
    }>(edgeResult).map((row) => ({
      did: row.did,
      direction: row.direction,
      listUri: row.list_uri,
    })),
  );

  return hydrateBlockedAccounts(
    rows.map((row) => ({
      did: row.did,
      handle: row.handle,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      createdAt: toIso(row.created_at),
      block: edges.get(row.did) ?? null,
    })),
  );
}

/** Whether the reader has allowlisted this account. */
export async function isBlockAllowlisted(
  db: Db,
  schema: Schema,
  viewerDid: string,
  did: string,
): Promise<boolean> {
  const a = schema.blockAllowlist;
  const result = await db.execute(sql`
    select exists(
      select 1 from ${a}
      where ${a.ownerDid} = ${viewerDid} and ${a.subjectDid} = ${did}
    ) as allowed
  `);
  return executeRows<{ allowed: boolean }>(result)[0]?.allowed ?? false;
}

/** Why an allowlist add was refused. */
export type AllowlistAddResult =
  | { ok: true }
  | { ok: false; reason: "self" | "full" };

/**
 * Exempt `did` from the reader's blocks. Idempotent: allowing an account twice
 * leaves one row and the original `created_at`.
 *
 * No cache to drop: {@link readerHasBlocks} answers "does this reader have any
 * blocks", which an exemption doesn't change — the exemption is applied inside
 * the edge query and the feed predicate, which aren't cached across requests.
 */
export async function addToBlockAllowlist(
  db: Db,
  schema: Schema,
  viewerDid: string,
  did: string,
): Promise<AllowlistAddResult> {
  if (did === viewerDid) return { ok: false, reason: "self" };
  const a = schema.blockAllowlist;
  // Counted rather than enforced by a constraint: the cap is product policy,
  // and a racing double-add past it by one is harmless.
  const countResult = await db.execute(sql`
    select count(*)::int as count from ${a} where ${a.ownerDid} = ${viewerDid}
  `);
  const count = executeRows<{ count: number }>(countResult)[0]?.count ?? 0;
  if (
    count >= BLOCK_ALLOWLIST_MAX &&
    !(await isBlockAllowlisted(db, schema, viewerDid, did))
  ) {
    return { ok: false, reason: "full" };
  }

  await db
    .insert(a)
    .values({ ownerDid: viewerDid, subjectDid: did })
    .onConflictDoNothing();
  return { ok: true };
}

/** Put `did` back under the reader's blocks. A no-op if it wasn't allowlisted. */
export async function removeFromBlockAllowlist(
  db: Db,
  schema: Schema,
  viewerDid: string,
  did: string,
): Promise<void> {
  const a = schema.blockAllowlist;
  await db.execute(sql`
    delete from ${a}
    where ${a.ownerDid} = ${viewerDid} and ${a.subjectDid} = ${did}
  `);
}

/** How many accounts the reader blocks directly. */
export async function countReaderBlockedAccounts(
  db: Db,
  schema: Schema,
  viewerDid: string,
): Promise<number> {
  const b = schema.blocks;
  const result = await db.execute(sql`
    select count(*)::int as count from ${b}
    where ${b.blockerDid} = ${viewerDid} and ${b.deleted} = false
  `);
  return executeRows<{ count: number }>(result)[0]?.count ?? 0;
}

/** A moderation list the reader blocks, as rendered in settings. */
export interface BlockListRow {
  uri: string;
  listUri: string;
  listOwnerDid: string;
  name: string | null;
  description: string | null;
  /** Members mirrored for this list — what the block actually covers here. */
  memberCount: number;
  /**
   * The list is bigger than the mirror cap, so the block is partial. Surfaced
   * rather than hidden: under-enforcing a blocklist silently is worse than
   * saying so.
   */
  truncated: boolean;
  syncedAt: string | null;
  createdAt: string | null;
}

/** The moderation lists the reader blocks, with mirror state for each. */
export async function readerBlockLists(
  db: Db,
  schema: Schema,
  viewerDid: string,
): Promise<Array<BlockListRow>> {
  const bl = schema.blockLists;
  const ls = schema.blockListSyncState;
  const result = await db.execute(sql`
    select
      ${bl.uri} as uri,
      ${bl.listUri} as list_uri,
      ${bl.createdAt} as created_at,
      ${ls.name} as name,
      ${ls.description} as description,
      ${ls.ownerDid} as owner_did,
      ${ls.itemCount} as item_count,
      ${ls.truncated} as truncated,
      ${ls.syncedAt} as synced_at
    from ${bl}
    left join ${ls} on ${ls.listUri} = ${bl.listUri}
    where ${bl.blockerDid} = ${viewerDid} and ${bl.deleted} = false
    order by ${bl.createdAt} desc nulls last, ${bl.uri} desc
  `);
  return executeRows<{
    uri: string;
    list_uri: string;
    created_at: Date | string | null;
    name: string | null;
    description: string | null;
    owner_did: string | null;
    item_count: number | null;
    truncated: boolean | null;
    synced_at: Date | string | null;
  }>(result).map((row) => ({
    uri: row.uri,
    listUri: row.list_uri,
    listOwnerDid: row.owner_did ?? listOwnerFromUri(row.list_uri),
    name: row.name,
    description: row.description,
    memberCount: row.item_count ?? 0,
    truncated: row.truncated ?? false,
    syncedAt: toIso(row.synced_at),
    createdAt: toIso(row.created_at),
  }));
}

function listOwnerFromUri(listUri: string): string {
  const rest = listUri.slice("at://".length);
  const slash = rest.indexOf("/");
  return slash === -1 ? rest : rest.slice(0, slash);
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}
