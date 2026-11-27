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
import {
  cardMatchesMutedWords,
  compileMutedWordMatcher,
  MAX_MUTED_WORDS,
  mutedWordPostgresPattern,
  normalizeMutedWord,
} from "#/lib/muted-words";
import type { MutableCard, MutedSubjects } from "#/lib/mutes";
import { muteCandidateKeys, rejectMutedCards } from "#/lib/mutes";

/** Read rows off a drizzle `db.execute` result (array or `{ rows }`). */
function executeRows<T>(result: unknown): Array<T> {
  if (Array.isArray(result)) return result as Array<T>;
  return ((result as { rows?: Array<T> }).rows ?? []) as Array<T>;
}

/**
 * How long a reader's mute state is trusted in-process.
 *
 * Short, because the answer flipping false→true is a reader who just muted
 * something and expects it gone. Every write path calls
 * {@link invalidateMuteCache} anyway, so the TTL only covers mutes made in
 * another client (picked up by the firehose) or on another web replica.
 */
const MUTE_STATE_TTL_MS = 60_000;

/**
 * Bound on the cache — same rationale as the blocks gate: a small value per
 * signed-in reader, dropped wholesale rather than evicted, re-earned by one
 * indexed lookup.
 */
const MUTE_STATE_CACHE_MAX = 10_000;

/**
 * What a reader mutes, at the granularity the filters branch on: whether any
 * user/publication mute exists (the subject probes are skipped otherwise), and
 * their muted words (few, short, and needed in JS to post-filter rails).
 */
export interface ReaderMuteState {
  hasSubjectMutes: boolean;
  /** Normalized muted words (`normalizeMutedWord`), alphabetical. */
  words: ReadonlyArray<string>;
}

const NO_MUTES: ReaderMuteState = { hasSubjectMutes: false, words: [] };

const muteStateCache = new Map<
  string,
  { value: ReaderMuteState; expires: number }
>();

/** Drop a reader's cached mute state, after they change any mute or word. */
export function invalidateMuteCache(did: string): void {
  muteStateCache.delete(did);
}

/**
 * The reader's mute state, in one round trip: an indexed `EXISTS` on `mutes`
 * plus their `muted_words` rows (a primary-key range scan). Cached per-request
 * via {@link reactCache} and across requests in-process for
 * {@link MUTE_STATE_TTL_MS}, so a reader who mutes nothing costs nothing on the
 * steady path.
 */
export const readerMuteState = reactCache(readerMuteStateImpl);

async function readerMuteStateImpl(
  db: Db,
  schema: Schema,
  viewerDid: string,
): Promise<ReaderMuteState> {
  const cached = muteStateCache.get(viewerDid);
  if (cached && cached.expires > Date.now()) return cached.value;

  const m = schema.mutes;
  const w = schema.mutedWords;
  const result = await db.execute(sql`
    select
      exists(
        select 1 from ${m}
        where ${m.muterDid} = ${viewerDid} and ${m.deleted} = false
      ) as has,
      coalesce(
        (
          select jsonb_agg(${w.word} order by ${w.word})
          from ${w}
          where ${w.ownerDid} = ${viewerDid}
        ),
        '[]'::jsonb
      ) as words
  `);
  const row = executeRows<{ has: boolean; words: unknown }>(result)[0];
  const value: ReaderMuteState = row
    ? { hasSubjectMutes: row.has === true, words: parseWords(row.words) }
    : NO_MUTES;

  if (muteStateCache.size >= MUTE_STATE_CACHE_MAX) muteStateCache.clear();
  muteStateCache.set(viewerDid, {
    value,
    expires: Date.now() + MUTE_STATE_TTL_MS,
  });
  return value;
}

/** `jsonb` arrives parsed from `pg`, as text from some drivers. */
function parseWords(value: unknown): Array<string> {
  const parsed: unknown =
    typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  return Array.isArray(parsed)
    ? parsed.filter((word): word is string => typeof word === "string")
    : [];
}

/**
 * Whether this viewer mutes anything at all — a user, a publication, or a
 * word.
 *
 * The guard in front of every SQL predicate {@link notMutedByViewer} would
 * otherwise add, and the overwhelmingly common answer is "no".
 */
export async function readerHasMutes(
  db: Db,
  schema: Schema,
  viewerDid: string,
): Promise<boolean> {
  const state = await readerMuteState(db, schema, viewerDid);
  return state.hasSubjectMutes || state.words.length > 0;
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
 *  - `textExprs` — the row's own matchable text (muted words): a document's
 *    title + description, or a publication's name + description. Never the
 *    body — a word hides what is *about* it, not what mentions it.
 *
 * Each subject branch is one index probe on `mutes_user_edge_idx` /
 * `mutes_pub_edge_idx`. The word branch is not a per-row probe at all: the
 * reader's patterns are folded into one alternation by an *uncorrelated*
 * scalar subquery, which Postgres plans as an InitPlan and runs once per query
 * (one primary-key range scan of `muted_words`; verified `loops=1` even inside
 * the follow feed's per-source laterals), leaving a plain `~*` filter on
 * columns the row already carries — ~10µs a row with 20 words, paid only on
 * the rows the index scan visits anyway. A reader with no words gets a NULL
 * pattern, which `coalesce` turns into "not muted".
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
    textExprs?: ReadonlyArray<ReturnType<typeof sql>>;
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
  if (exprs.textExprs && exprs.textExprs.length > 0) {
    // One regex evaluation per row over the fields joined by U+001F (the
    // ASCII unit separator): a non-word, non-space character, so `\m`/`\M`
    // still see a boundary between fields and a phrase's `\s+` can never
    // bridge title → description. `normalizeMutedWord` strips control
    // characters, so no muted word can contain it. Measured ~40% cheaper than
    // one `~*` per field on prod data.
    branches.push(sql`coalesce(
      concat_ws(${MUTED_WORD_FIELD_SEPARATOR}, ${sql.join([...exprs.textExprs], sql`, `)})
        ~* ${mutedWordPatternSql(schema, viewerDid)},
      false
    )`);
  }
  if (branches.length === 0) return sql`true`;
  return sql`not (${sql.join(branches, sql` or `)})`;
}

/** Joins a row's matchable fields; see the word branch of {@link notMutedByViewer}. */
const MUTED_WORD_FIELD_SEPARATOR = "\u001F";

/**
 * The reader's muted words as one Postgres ARE alternation — NULL when they
 * mute no words. Uncorrelated, so it plans as a once-per-query InitPlan.
 */
function mutedWordPatternSql(
  schema: Schema,
  viewerDid: string,
): ReturnType<typeof sql> {
  const w = schema.mutedWords;
  return sql`(
    select string_agg(${w.pattern}, '|') from ${w}
    where ${w.ownerDid} = ${viewerDid}
  )`;
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
  // Subject mutes only — a reader who mutes words but no one shouldn't pay a
  // round trip to learn that none of these candidates is muted.
  const state = await readerMuteState(db, schema, viewerDid);
  if (!state.hasSubjectMutes) return empty;

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
 * Drop every card that renders a muted user or publication, or whose own
 * title/name/description contains a muted word. The rail filter: pair it with
 * {@link notMutedByViewer} on paginated feeds, and use it alone for rails and
 * third-party content.
 *
 * Words cost no round trip here — they ride along in the cached
 * {@link readerMuteState} — so only the subject probe ever hits the database.
 */
export async function filterMutedCards<T extends MutableCard>(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  cards: Array<T>,
): Promise<Array<T>> {
  if (!viewerDid || cards.length === 0) return cards;
  const state = await readerMuteState(db, schema, viewerDid);
  const matcher = compileMutedWordMatcher(state.words);
  const unworded = matcher
    ? cards.filter((card) => !cardMatchesMutedWords(card, matcher))
    : cards;
  if (!state.hasSubjectMutes || unworded.length === 0) return unworded;
  const muted = await mutedSubjectsAmong(
    db,
    schema,
    viewerDid,
    muteCandidateKeys(unworded),
  );
  return rejectMutedCards(unworded, muted);
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

/** How many things the reader mutes: users, publications, and words. */
export async function countReaderMutes(
  db: Db,
  schema: Schema,
  viewerDid: string,
): Promise<number> {
  const m = schema.mutes;
  const w = schema.mutedWords;
  const result = await db.execute(sql`
    select (
      (select count(*) from ${m}
        where ${m.muterDid} = ${viewerDid} and ${m.deleted} = false)
      + (select count(*) from ${w} where ${w.ownerDid} = ${viewerDid})
    )::int as count
  `);
  return executeRows<{ count: number }>(result)[0]?.count ?? 0;
}

// ── Muted words ─────────────────────────────────────────────────────────────

/** A muted word as rendered in the settings list. */
export interface MutedWordRow {
  word: string;
  createdAt: string | null;
}

/** The reader's muted words, alphabetical. */
export async function readerMutedWords(
  db: Db,
  schema: Schema,
  viewerDid: string,
): Promise<Array<MutedWordRow>> {
  const w = schema.mutedWords;
  const result = await db.execute(sql`
    select ${w.word} as word, ${w.createdAt} as created_at
    from ${w}
    where ${w.ownerDid} = ${viewerDid}
    order by ${w.word}
  `);
  return executeRows<{ word: string; created_at: Date | string | null }>(
    result,
  ).map((row) => ({ word: row.word, createdAt: toIso(row.created_at) }));
}

/** Why {@link addMutedWord} refused a word. */
export type AddMutedWordResult =
  | { ok: true; word: string }
  | { ok: false; reason: "invalid" | "limit" };

/**
 * Mute a word for the reader. Idempotent — re-adding an existing word (in any
 * casing or spacing) is a no-op success. Refuses past {@link MAX_MUTED_WORDS}
 * so the per-query alternation stays small.
 */
export async function addMutedWord(
  db: Db,
  schema: Schema,
  viewerDid: string,
  raw: string,
): Promise<AddMutedWordResult> {
  const word = normalizeMutedWord(raw);
  if (!word) return { ok: false, reason: "invalid" };
  const w = schema.mutedWords;
  // One statement: the cap check and the insert race-free enough for a single
  // reader's settings page, and one round trip instead of count-then-insert.
  const result = await db.execute(sql`
    insert into ${w} (owner_did, word, pattern)
    select ${viewerDid}, ${word}, ${mutedWordPostgresPattern(word)}
    where (select count(*) from ${w} where ${w.ownerDid} = ${viewerDid})
      < ${MAX_MUTED_WORDS}
    on conflict (owner_did, word) do nothing
    returning 1 as inserted
  `);
  invalidateMuteCache(viewerDid);
  if (executeRows(result).length > 0) return { ok: true, word };
  // Nothing inserted: either it was already muted (success) or the cap hit.
  const existing = await db.execute(sql`
    select 1 from ${w} where ${w.ownerDid} = ${viewerDid} and ${w.word} = ${word}
  `);
  return executeRows(existing).length > 0
    ? { ok: true, word }
    : { ok: false, reason: "limit" };
}

/** Unmute a word for the reader. */
export async function removeMutedWord(
  db: Db,
  schema: Schema,
  viewerDid: string,
  word: string,
): Promise<void> {
  const w = schema.mutedWords;
  await db.execute(sql`
    delete from ${w} where ${w.ownerDid} = ${viewerDid} and ${w.word} = ${word}
  `);
  invalidateMuteCache(viewerDid);
}

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}
