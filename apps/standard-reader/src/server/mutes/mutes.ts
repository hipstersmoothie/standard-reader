/**
 * Resolve a reader's mutes from the read-model.
 *
 * Mutes are mirrored `app.standard-reader.graph.mute` records (see
 * `db/schema/mutes.ts`); the ingester and the mute write path keep the mirror
 * current, and every request path reads them from here in SQL — rendering a
 * feed never costs a network call to work out what the reader muted.
 *
 * No `.server` suffix, deliberately: `reader/queries.ts` needs
 * {@link notMutedByViewer} and is itself reachable from the client bundle, so
 * a server-only module here would fail import protection at build time. Nothing
 * in this file is server-only — the Drizzle client is threaded in by the
 * caller, exactly as in `blocks/blocks.ts`.
 *
 * Mutes differ from blocks in two ways that shape everything here:
 *
 *  - **One direction only.** A mute lives in the muter's repo and hides content
 *    *from the muter*. Being muted hides nothing from you, so there is no
 *    incoming half to resolve.
 *  - **Two subject kinds.** A muted *user* (DID) hides everything they touch —
 *    documents they authored, documents from publications they own, their
 *    recommends. A muted *publication* (AT-URI) hides that publication's
 *    documents and the publication itself from discovery.
 *
 * Scope is feeds + discovery only: direct navigation to a muted publication,
 * author, or article keeps working, and subscriptions are untouched.
 *
 * **Bounded by the candidate set, never by the mute set.** Every helper takes
 * the DIDs/URIs a page is about to render and asks which of *those* are muted,
 * so the cost stays an index probe regardless of how much a reader mutes.
 */

import { inArray, sql } from "drizzle-orm";
import { cache as reactCache } from "react";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import type { MutableCard, MutedSubjects } from "#/lib/mutes";
import { muteCandidateKeys, rejectMutedCards } from "#/lib/mutes";

/** Read rows off a drizzle `db.execute` result (array or `{ rows }`). */
function executeRows<T>(result: unknown): Array<T> {
  if (Array.isArray(result)) return result as Array<T>;
  return ((result as { rows?: Array<T> }).rows ?? []) as Array<T>;
}

/**
 * How long "does this reader mute anything?" is trusted in-process.
 *
 * Short, because the answer flipping false→true is a reader who just muted
 * something and expects it gone. Every write path calls
 * {@link invalidateMuteCache} anyway, so the TTL only covers mutes made in
 * another client and picked up by the firehose.
 */
const HAS_MUTES_TTL_MS = 60_000;

/**
 * Bound on the cache — same rationale as the blocks gate: a single boolean per
 * signed-in reader, dropped wholesale rather than evicted, re-earned by one
 * indexed `EXISTS`.
 */
const HAS_MUTES_CACHE_MAX = 10_000;

const hasMutesCache = new Map<string, { value: boolean; expires: number }>();

/** Drop a reader's cached answer, after they mute or unmute anything. */
export function invalidateMuteCache(did: string): void {
  hasMutesCache.delete(did);
}

/**
 * Whether this viewer has any mutes at all.
 *
 * The guard in front of every other helper here, and in front of every SQL
 * predicate {@link notMutedByViewer} would otherwise add — and the
 * overwhelmingly common answer is "no". Cached per-request via
 * {@link reactCache} and across requests in-process for
 * {@link HAS_MUTES_TTL_MS}, so a reader who mutes nothing costs nothing on the
 * steady path.
 */
export const readerHasMutes = reactCache(readerHasMutesImpl);

async function readerHasMutesImpl(
  db: Db,
  schema: Schema,
  viewerDid: string,
): Promise<boolean> {
  const cached = hasMutesCache.get(viewerDid);
  if (cached && cached.expires > Date.now()) return cached.value;

  const m = schema.mutes;
  const result = await db.execute(sql`
    select exists(
      select 1 from ${m}
      where ${m.muterDid} = ${viewerDid} and ${m.deleted} = false
    ) as has
  `);
  const value = executeRows<{ has: boolean }>(result)[0]?.has ?? false;

  if (hasMutesCache.size >= HAS_MUTES_CACHE_MAX) hasMutesCache.clear();
  hasMutesCache.set(viewerDid, {
    value,
    expires: Date.now() + HAS_MUTES_TTL_MS,
  });
  return value;
}

/**
 * The DID to hand a query builder's `muterDid`, or `undefined` to leave the
 * query alone.
 *
 * **The only supported way to reach {@link notMutedByViewer} from a feed** —
 * the same contract as `blockFilterDid`: the predicate is up to three
 * correlated `NOT EXISTS` per candidate row, and paying that for the majority
 * of readers who mute nothing would regress every feed to serve empty result
 * sets. The predicate is added only once the cached {@link readerHasMutes}
 * says it can match.
 */
export async function muteFilterDid(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
): Promise<string | undefined> {
  if (!viewerDid) return undefined;
  return (await readerHasMutes(db, schema, viewerDid)) ? viewerDid : undefined;
}

/**
 * `NOT EXISTS` predicate excluding muted subjects for `viewerDid`, for use
 * inside a paginated query — post-filtering a page is fine for a rail (see
 * {@link filterMutedCards}) but drops rows after `LIMIT` on a feed.
 *
 * Callers pass whichever expressions the row can supply:
 *
 *  - `authorDidExpr` — the row's author DID (user mutes).
 *  - `ownerDidExpr` — the owner of the row's publication, usually
 *    `atUriAuthoritySql(publicationUri)` (user mutes reach guest posts in a
 *    muted user's publication). NULL for a loose document never matches.
 *  - `pubUriExpr` — the row's publication AT-URI for documents, or the row's
 *    own URI for publication-shaped rows (publication mutes).
 *
 * Each branch is one index probe on `mutes_user_edge_idx` /
 * `mutes_pub_edge_idx`.
 *
 * **Never pass a raw session DID here.** Resolve it through
 * {@link muteFilterDid} first.
 */
export function notMutedByViewer(
  schema: Schema,
  viewerDid: string,
  exprs: {
    authorDidExpr?: ReturnType<typeof sql>;
    ownerDidExpr?: ReturnType<typeof sql>;
    pubUriExpr?: ReturnType<typeof sql>;
  },
): ReturnType<typeof sql> {
  const m = schema.mutes;
  const branches: Array<ReturnType<typeof sql>> = [];
  for (const didExpr of [exprs.authorDidExpr, exprs.ownerDidExpr]) {
    if (didExpr) {
      branches.push(sql`exists(
        select 1 from ${m}
        where ${m.muterDid} = ${viewerDid}
          and ${m.deleted} = false
          and ${m.subjectDid} = ${didExpr}
      )`);
    }
  }
  if (exprs.pubUriExpr) {
    branches.push(sql`exists(
      select 1 from ${m}
      where ${m.muterDid} = ${viewerDid}
        and ${m.deleted} = false
        and ${m.subjectUri} = ${exprs.pubUriExpr}
    )`);
  }
  if (branches.length === 0) return sql`true`;
  return sql`not (${sql.join(branches, sql` or `)})`;
}

/**
 * Which of the candidate subjects are muted for `viewerDid`, split by kind.
 *
 * The post-filter workhorse for rails and for pre-filtering query inputs (the
 * follow feed drops muted DIDs/publication URIs from its source sets before
 * the query runs). Gated on {@link readerHasMutes} and narrowed to the
 * candidates, so it stays an index probe.
 */
export async function mutedSubjectsAmong(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  candidates: { dids?: ReadonlyArray<string>; uris?: ReadonlyArray<string> },
): Promise<MutedSubjects> {
  const empty: MutedSubjects = { dids: new Set(), uris: new Set() };
  if (!viewerDid) return empty;
  const dids = [...new Set(candidates.dids ?? [])].filter(
    (did) => did.startsWith("did:") && did !== viewerDid,
  );
  const uris = [...new Set(candidates.uris ?? [])].filter((uri) =>
    uri.startsWith("at://"),
  );
  if (dids.length === 0 && uris.length === 0) return empty;
  if (!(await readerHasMutes(db, schema, viewerDid))) return empty;

  const m = schema.mutes;
  const parts: Array<ReturnType<typeof sql>> = [];
  if (dids.length > 0) {
    parts.push(sql`
      select ${m.subjectDid} as did, null as uri from ${m}
      where ${m.muterDid} = ${viewerDid}
        and ${m.deleted} = false
        and ${inArray(m.subjectDid, dids)}
    `);
  }
  if (uris.length > 0) {
    parts.push(sql`
      select null as did, ${m.subjectUri} as uri from ${m}
      where ${m.muterDid} = ${viewerDid}
        and ${m.deleted} = false
        and ${inArray(m.subjectUri, uris)}
    `);
  }
  const result = await db.execute(sql.join(parts, sql` union all `));
  const rows = executeRows<{ did: string | null; uri: string | null }>(result);
  const mutedDids = new Set<string>();
  const mutedUris = new Set<string>();
  for (const row of rows) {
    if (row.did) mutedDids.add(row.did);
    if (row.uri) mutedUris.add(row.uri);
  }
  return { dids: mutedDids, uris: mutedUris };
}

/** Which of `dids` are muted users for `viewerDid`. */
export async function mutedDidsAmong(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  dids: ReadonlyArray<string>,
): Promise<Set<string>> {
  const muted = await mutedSubjectsAmong(db, schema, viewerDid, { dids });
  return new Set(muted.dids);
}

/** Whether one subject (a DID or publication AT-URI) is muted by the viewer. */
export async function isMutedForViewer(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  subject: string | null | undefined,
): Promise<boolean> {
  if (!subject) return false;
  const candidates = subject.startsWith("did:")
    ? { dids: [subject] }
    : { uris: [subject] };
  const muted = await mutedSubjectsAmong(db, schema, viewerDid, candidates);
  return muted.dids.size > 0 || muted.uris.size > 0;
}

/**
 * Drop every card that renders a muted user or publication. The rail filter:
 * pair it with {@link notMutedByViewer} on paginated feeds, and use it alone
 * for rails and third-party content.
 */
export async function filterMutedCards<T extends MutableCard>(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  cards: Array<T>,
): Promise<Array<T>> {
  if (!viewerDid || cards.length === 0) return cards;
  const muted = await mutedSubjectsAmong(
    db,
    schema,
    viewerDid,
    muteCandidateKeys(cards),
  );
  return rejectMutedCards(cards, muted);
}

// ── Settings surfaces ───────────────────────────────────────────────────────

/** A muted user as rendered in the settings list. */
export interface MutedUserRow {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** The mute record's AT-URI. */
  uri: string;
  createdAt: string | null;
}

/** A muted publication as rendered in the settings list. */
export interface MutedPublicationRow {
  /** AT-URI of the muted `site.standard.publication`. */
  subjectUri: string;
  name: string | null;
  url: string | null;
  ownerDid: string | null;
  iconCid: string | null;
  /** The mute record's AT-URI. */
  uri: string;
  createdAt: string | null;
}

/**
 * The reader's muted users, newest first, joined to whatever profile we have
 * mirrored. Anything the mirror can't name is resolved from the public
 * AppView in one batched call — merged at read time, never written back, so a
 * mute doesn't quietly enrol an account into the read-model.
 */
export async function readerMutedUsers(
  db: Db,
  schema: Schema,
  viewerDid: string,
  opts: { limit: number; offset?: number },
): Promise<Array<MutedUserRow>> {
  const m = schema.mutes;
  const p = schema.profiles;
  const result = await db.execute(sql`
    select
      ${m.subjectDid} as did,
      ${m.uri} as uri,
      ${m.createdAt} as created_at,
      ${p.handle} as handle,
      ${p.displayName} as display_name,
      ${p.avatarUrl} as avatar_url
    from ${m}
    left join ${p} on ${p.did} = ${m.subjectDid}
    where ${m.muterDid} = ${viewerDid}
      and ${m.deleted} = false
      and ${m.subjectDid} is not null
    order by ${m.createdAt} desc nulls last, ${m.uri} desc
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
    createdAt: toIso(row.created_at),
  }));

  return hydrateMutedUsers(rows);
}

/**
 * Fill in identity for muted users the read-model has never seen — same
 * rationale and mechanics as `hydrateBlockedAccounts` in `blocks/blocks.ts`.
 */
async function hydrateMutedUsers(
  rows: Array<MutedUserRow>,
): Promise<Array<MutedUserRow>> {
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

/**
 * The reader's muted publications, newest first, joined to the mirrored
 * publication for a name/icon. A muted publication we've never mirrored still
 * renders — just as its bare AT-URI.
 */
export async function readerMutedPublications(
  db: Db,
  schema: Schema,
  viewerDid: string,
  opts: { limit: number; offset?: number },
): Promise<Array<MutedPublicationRow>> {
  const m = schema.mutes;
  const pub = schema.publications;
  const result = await db.execute(sql`
    select
      ${m.subjectUri} as subject_uri,
      ${m.uri} as uri,
      ${m.createdAt} as created_at,
      ${pub.name} as name,
      ${pub.url} as url,
      ${pub.did} as owner_did,
      ${pub.iconCid} as icon_cid
    from ${m}
    left join ${pub} on ${pub.uri} = ${m.subjectUri}
    where ${m.muterDid} = ${viewerDid}
      and ${m.deleted} = false
      and ${m.subjectUri} is not null
    order by ${m.createdAt} desc nulls last, ${m.uri} desc
    limit ${opts.limit} offset ${opts.offset ?? 0}
  `);
  return executeRows<{
    subject_uri: string;
    uri: string;
    created_at: Date | string | null;
    name: string | null;
    url: string | null;
    owner_did: string | null;
    icon_cid: string | null;
  }>(result).map((row) => ({
    subjectUri: row.subject_uri,
    uri: row.uri,
    name: row.name,
    url: row.url,
    ownerDid: row.owner_did,
    iconCid: row.icon_cid,
    createdAt: toIso(row.created_at),
  }));
}

/** How many subjects the reader mutes (both kinds). */
export async function countReaderMutes(
  db: Db,
  schema: Schema,
  viewerDid: string,
): Promise<number> {
  const m = schema.mutes;
  const result = await db.execute(sql`
    select count(*)::int as count from ${m}
    where ${m.muterDid} = ${viewerDid} and ${m.deleted} = false
  `);
  return executeRows<{ count: number }>(result)[0]?.count ?? 0;
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}
