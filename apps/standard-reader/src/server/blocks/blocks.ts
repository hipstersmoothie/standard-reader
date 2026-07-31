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
): ReturnType<typeof sql> {
  const b = schema.blocks;
  const bl = schema.blockLists;
  const bli = schema.blockListItems;
  const mutable = [...dids];
  return sql`
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
}

/**
 * Whether this viewer has any blocks at all, in either direction.
 *
 * Memoized per request ({@link reactCache}) because it is the guard in front of
 * every other helper here, and the overwhelmingly common answer is "no". A
 * single page load filters several card sets (critical rows, then rails, then
 * comments); without this each one would issue a block query for a reader who
 * has never blocked anybody. `db`/`schema` are stable singletons and `viewerDid`
 * is stable within a request, so all of them share one query.
 */
const viewerHasBlocks = reactCache(viewerHasBlocksImpl);

async function viewerHasBlocksImpl(
  db: Db,
  schema: Schema,
  viewerDid: string,
): Promise<boolean> {
  const b = schema.blocks;
  const bl = schema.blockLists;
  const bli = schema.blockListItems;
  const result = await db.execute(sql`
    select (
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
    ) as has
  `);
  return executeRows<{ has: boolean }>(result)[0]?.has ?? false;
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
  if (!(await viewerHasBlocks(db, schema, viewerDid))) return new Map();

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
 * inside a paginated query.
 *
 * Post-filtering a page is fine for a rail (see {@link filterBlockedCards}) but
 * wrong for a feed: dropping rows *after* `LIMIT` shortens the page and, on a
 * reader who blocks a large list, can empty it entirely while more results wait
 * behind the offset. `didExpr` is the outer author-DID column to correlate on
 * (e.g. `sql`"documents"."did"``).
 *
 * The list branches use `EXISTS` over the join rather than an `IN` expansion so
 * a 40k-member blocklist stays an index probe per candidate row.
 */
export function notBlockedByViewer(
  schema: Schema,
  viewerDid: string,
  didExpr: ReturnType<typeof sql>,
): ReturnType<typeof sql> {
  const b = schema.blocks;
  const bl = schema.blockLists;
  const bli = schema.blockListItems;
  return sql`not (
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
  )`;
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
  return executeRows<{
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
