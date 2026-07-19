/**
 * "Publications by people you follow" — the bridge between a reader's Bluesky
 * social graph and the standard.site publications indexed in the read-model.
 *
 * The join runs candidate-first: the read-model knows every DID that publishes
 * (a bounded, network-wide set), so we ask the Bluesky AppView "of these, which
 * do I follow?" via `app.bsky.graph.getRelationships` (30 DIDs per request)
 * rather than paginating the reader's follow list. That keeps the cost tied to
 * the size of the author set instead of the reader's follow count, and needs no
 * stored mirror of the Bluesky graph.
 *
 * If the author set ever outgrows {@link FRIEND_CANDIDATE_LIMIT} the trade
 * inverts and the reverse direction (paginate `app.bsky.graph.getFollows`, cache
 * per reader) becomes the cheaper one; `truncated` on the result marks when
 * we've hit that ceiling.
 */

import { and, asc, desc, eq, exists, inArray, sql } from "drizzle-orm";

import type {
  Db,
  PublicationCard,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import {
  publicationCardColumns,
  toPublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import { followedDidsForActor } from "#/server/atproto/bsky-relationships";
import { discoverEligiblePublicationWhere } from "#/server/reader/publication-filters";

/**
 * Ceiling on candidate author DIDs checked against the Bluesky graph.
 *
 * Sized to cover the whole network with room to grow: batches of 30 run
 * concurrently, so ~2,800 authors is ~95 requests and measures under a second
 * against the public AppView. Candidates are ordered by readership, so if the
 * network ever outgrows this the check still covers the authors a reader is
 * most likely to follow — and the result is flagged `truncated`.
 */
export const FRIEND_CANDIDATE_LIMIT = 5000;

export interface FriendPublisher {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** True when the reader already follows this person *in Standard Reader*. */
  followedInApp: boolean;
  publications: Array<PublicationCard>;
}

export interface FriendPublishers {
  /** This page of people. */
  people: Array<FriendPublisher>;
  /** Every matching person, not just this page — the headline count. */
  totalPeople: number;
  /** Total publications across every match — the headline count. */
  publicationCount: number;
  /** Offset for the next page, or `null` at the end. */
  nextOffset: number | null;
  /** Publication URIs on this page the reader already subscribes to. */
  subscribedUris: Array<string>;
  /**
   * The Bluesky AppView didn't answer for at least one batch, so the result is
   * incomplete. The UI must say "couldn't check" rather than "nobody found".
   */
  degraded: boolean;
  /** Candidate authors exceeded {@link FRIEND_CANDIDATE_LIMIT}. */
  truncated: boolean;
}

export const EMPTY_FRIEND_PUBLISHERS: FriendPublishers = {
  people: [],
  totalPeople: 0,
  publicationCount: 0,
  nextOffset: null,
  subscribedUris: [],
  degraded: false,
  truncated: false,
};

/** Default page size for `/friends`. */
export const FRIEND_PAGE_SIZE = 12;

interface CachedGraph {
  followedDids: Array<string>;
  degraded: boolean;
  truncated: boolean;
  at: number;
}

/**
 * The Bluesky sweep (dozens of `getRelationships` requests) is far too
 * expensive to repeat for page two. Results are held per reader for a few
 * minutes so paging is DB-only; the graph doesn't move fast enough for the
 * staleness to matter, and losing the cache on restart is harmless.
 */
const GRAPH_CACHE_TTL_MS = 10 * 60_000;
const GRAPH_CACHE_MAX = 500;
const graphCache = new Map<string, CachedGraph>();

function readGraphCache(readerDid: string): CachedGraph | null {
  const hit = graphCache.get(readerDid);
  if (!hit) return null;
  if (Date.now() - hit.at > GRAPH_CACHE_TTL_MS) {
    graphCache.delete(readerDid);
    return null;
  }
  return hit;
}

function writeGraphCache(readerDid: string, value: CachedGraph): void {
  if (graphCache.size >= GRAPH_CACHE_MAX) {
    // Map preserves insertion order, so the first key is the oldest write.
    const oldest = graphCache.keys().next().value;
    if (oldest !== undefined) graphCache.delete(oldest);
  }
  graphCache.set(readerDid, value);
}

/**
 * The candidate list is identical for every reader and costs ~900ms, so it's
 * memoized process-wide rather than per reader. A new publication showing up a
 * few minutes late is invisible to the reader.
 */
const CANDIDATE_CACHE_TTL_MS = 10 * 60_000;
let candidateCache: { dids: Array<string>; limit: number; at: number } | null =
  null;

/**
 * Author DIDs worth checking against the reader's Bluesky follows: owners of
 * discover-eligible publications that actually have indexed documents, ordered
 * by readership so the cap (if hit) keeps the most notable authors.
 */
async function candidateAuthorDids(
  db: Db,
  schema: Schema,
  limit: number,
): Promise<Array<string>> {
  const cached = candidateCache;
  if (
    cached &&
    cached.limit === limit &&
    Date.now() - cached.at < CANDIDATE_CACHE_TTL_MS
  ) {
    return cached.dids;
  }
  const p = schema.publications;
  const st = schema.publicationStats;
  const doc = schema.documents;

  const rows = await db
    .select({
      did: p.did,
      score: sql<number>`sum(coalesce(${st.subscriberCount}, 0))`.mapWith(
        Number,
      ),
    })
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .where(
      and(
        discoverEligiblePublicationWhere(p),
        exists(
          db
            .select({ one: sql`1` })
            .from(doc)
            .where(and(eq(doc.publicationUri, p.uri), eq(doc.deleted, false))),
        ),
      ),
    )
    .groupBy(p.did)
    .orderBy(desc(sql`sum(coalesce(${st.subscriberCount}, 0))`), asc(p.did))
    .limit(limit);

  const dids = rows.map((row) => row.did);
  candidateCache = { dids, limit, at: Date.now() };
  return dids;
}

/** Every publication owned by `dids`, as cards, newest-first within an owner. */
async function publicationsByAuthors(
  db: Db,
  schema: Schema,
  dids: Array<string>,
): Promise<Map<string, Array<PublicationCard>>> {
  const grouped = new Map<string, Array<PublicationCard>>();
  if (dids.length === 0) return grouped;

  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;
  const doc = schema.documents;

  const rows = await db
    .select(publicationCardColumns(schema))
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(
      and(
        inArray(p.did, dids),
        discoverEligiblePublicationWhere(p),
        exists(
          db
            .select({ one: sql`1` })
            .from(doc)
            .where(and(eq(doc.publicationUri, p.uri), eq(doc.deleted, false))),
        ),
      ),
    )
    .orderBy(sql`${st.lastDocumentAt} desc nulls last`, asc(p.name));

  for (const row of rows) {
    const card = toPublicationCard(row);
    const list = grouped.get(card.did);
    if (list) list.push(card);
    else grouped.set(card.did, [card]);
  }
  return grouped;
}

/** Combined readership across everything a person publishes. */
function totalReaders(person: FriendPublisher): number {
  return person.publications.reduce((n, pub) => n + pub.subscriberCount, 0);
}

export interface FriendProfileRow {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Assemble the person-grouped result from the pieces the DB returned: drop
 * followed DIDs that publish nothing, prefer the profile row for identity and
 * fall back to whatever the publication carries, and rank by combined
 * readership (handle breaks ties, so the order is stable between requests).
 * Pure so it can be unit-tested without a DB.
 */
export function buildFriendPublishers({
  followedDids,
  publicationsByDid,
  profiles,
  appFollowedDids,
}: {
  followedDids: ReadonlyArray<string>;
  publicationsByDid: ReadonlyMap<string, Array<PublicationCard>>;
  profiles: ReadonlyMap<string, FriendProfileRow>;
  appFollowedDids: ReadonlySet<string>;
}): Array<FriendPublisher> {
  const people: Array<FriendPublisher> = [];
  for (const did of followedDids) {
    const publications = publicationsByDid.get(did);
    if (!publications || publications.length === 0) continue;
    const profile = profiles.get(did);
    people.push({
      did,
      handle: profile?.handle ?? publications[0]?.ownerHandle ?? null,
      displayName: profile?.displayName ?? null,
      avatarUrl: profile?.avatarUrl ?? publications[0]?.ownerAvatarUrl ?? null,
      followedInApp: appFollowedDids.has(did),
      publications,
    });
  }

  people.sort((a, b) => {
    const diff = totalReaders(b) - totalReaders(a);
    if (diff !== 0) return diff;
    return (a.handle ?? a.did).localeCompare(b.handle ?? b.did);
  });

  return people;
}

/**
 * Publications authored by the Bluesky accounts `readerDid` follows.
 *
 * Grouped by person, because that's the unit the reader thinks in: "Anna
 * writes here" rather than "here is a publication that happens to be Anna's".
 * People are ordered by total readership across their publications.
 */
export async function friendPublishers(
  db: Db,
  schema: Schema,
  readerDid: string,
  opts: { candidateLimit?: number; limit?: number; offset?: number } = {},
): Promise<FriendPublishers> {
  const limit = opts.limit ?? FRIEND_PAGE_SIZE;
  const offset = opts.offset ?? 0;

  const graph =
    readGraphCache(readerDid) ??
    (await (async (): Promise<CachedGraph> => {
      const candidateLimit = opts.candidateLimit ?? FRIEND_CANDIDATE_LIMIT;
      // One past the cap, so "exactly full" is distinguishable from "overflowing".
      const candidates = await candidateAuthorDids(
        db,
        schema,
        candidateLimit + 1,
      );
      const truncated = candidates.length > candidateLimit;
      const checked = truncated
        ? candidates.slice(0, candidateLimit)
        : candidates;

      const { followed, failedBatches, batches } = await followedDidsForActor(
        readerDid,
        checked,
      );
      const fresh: CachedGraph = {
        followedDids: [...followed],
        degraded: failedBatches > 0 && batches > 0,
        truncated,
        at: Date.now(),
      };
      // A degraded sweep is a partial answer; don't pin it for ten minutes.
      if (!fresh.degraded) writeGraphCache(readerDid, fresh);
      return fresh;
    })());

  const { followedDids, degraded, truncated } = graph;
  if (followedDids.length === 0) {
    return { ...EMPTY_FRIEND_PUBLISHERS, degraded, truncated };
  }

  const uf = schema.userFollows;
  const sub = schema.subscriptions;
  const pr = schema.profiles;

  const [byAuthor, appFollowRows, profileRows] = await Promise.all([
    publicationsByAuthors(db, schema, followedDids),
    db
      .select({ did: uf.subjectDid })
      .from(uf)
      .where(
        and(
          eq(uf.followerDid, readerDid),
          eq(uf.deleted, false),
          inArray(uf.subjectDid, followedDids),
        ),
      ),
    db
      .select({
        did: pr.did,
        handle: pr.handle,
        displayName: pr.displayName,
        avatarUrl: pr.avatarUrl,
      })
      .from(pr)
      .where(inArray(pr.did, followedDids)),
  ]);

  const people = buildFriendPublishers({
    followedDids,
    publicationsByDid: byAuthor,
    profiles: new Map(profileRows.map((row) => [row.did, row])),
    appFollowedDids: new Set(appFollowRows.map((row) => row.did)),
  });

  // Headline counts describe the whole match; only a page is serialized. 240
  // people with their publication cards is half a megabyte of JSON otherwise.
  const totalPeople = people.length;
  const publicationCount = people.reduce(
    (n, person) => n + person.publications.length,
    0,
  );
  const page = people.slice(offset, offset + limit);
  const nextOffset = offset + limit < totalPeople ? offset + limit : null;

  const publicationUris = page.flatMap((person) =>
    person.publications.map((pub) => pub.uri),
  );
  const subscribedRows =
    publicationUris.length > 0
      ? await db
          .select({ uri: sub.publicationUri })
          .from(sub)
          .where(
            and(
              eq(sub.subscriberDid, readerDid),
              eq(sub.deleted, false),
              inArray(sub.publicationUri, publicationUris),
            ),
          )
      : [];

  return {
    people: page,
    totalPeople,
    publicationCount,
    nextOffset,
    subscribedUris: [...new Set(subscribedRows.map((row) => row.uri))],
    degraded,
    truncated,
  };
}
