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
import { alias } from "drizzle-orm/pg-core";

import type {
  ArticleCard,
  Db,
  PublicationCard,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import {
  articleCardColumns,
  publicationCardColumns,
  toArticleCard,
  toPublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import { followedDidsForActor } from "#/server/atproto/bsky-relationships";
import { documentPublishedNotInFuture } from "#/server/reader/document-filters";
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

/** A writer you follow, for the Discover prompt's avatar stack. */
export interface FriendAuthor {
  did: string;
  handle: string | null;
  avatarUrl: string | null;
}

export interface FriendPublishers {
  /** This page of publications, ranked by readership. */
  publications: Array<PublicationCard>;
  /** Every matching publication, not just this page — the headline count. */
  publicationCount: number;
  /** Distinct writers behind those publications — the headline count. */
  totalPeople: number;
  /** A few writers for the Discover prompt's avatar stack. */
  previewAuthors: Array<FriendAuthor>;
  /** Offset for the next page, or `null` at the end. */
  nextOffset: number | null;
  /**
   * Publications on this page the reader already subscribes to. Normally empty
   * — subscriptions are filtered out server-side — but a row subscribed to
   * during this visit stays put, so the client seeds its state from here.
   */
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
  publications: [],
  publicationCount: 0,
  totalPeople: 0,
  previewAuthors: [],
  nextOffset: null,
  subscribedUris: [],
  degraded: false,
  truncated: false,
};

/** Writers shown in the Discover prompt's avatar stack. */
export const FRIEND_PREVIEW_AUTHORS = 4;

/** Default page size for `/friends`. Matches the Discover directory. */
export const FRIEND_PAGE_SIZE = 24;

/** Page size for the Articles tab. Matches the other chronological feeds. */
export const FRIEND_ARTICLE_PAGE_SIZE = 20;

export interface FriendArticles {
  items: Array<ArticleCard>;
  /** Offset for the next page, or `null` at the end. */
  nextOffset: number | null;
  /** See {@link FriendPublishers.degraded}. */
  degraded: boolean;
}

export const EMPTY_FRIEND_ARTICLES: FriendArticles = {
  items: [],
  nextOffset: null,
  degraded: false,
};

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

/**
 * Rank the publications written by people you follow. Ordered by readership so
 * the best-known writing leads, with name and URI breaking ties so the order is
 * stable between requests (and therefore between pages).
 *
 * Publications the reader already subscribes to are dropped: this is a page of
 * things to discover, and a list of rows already marked "Subscribed" is just
 * noise between the reader and what's new to them.
 *
 * A flat list, not a per-person grouping: the reader is picking publications to
 * subscribe to, and every row already names its author. Pure so it can be
 * unit-tested without a DB.
 */
export function rankFriendPublications(
  followedDids: ReadonlyArray<string>,
  publicationsByDid: ReadonlyMap<string, Array<PublicationCard>>,
  subscribedUris: ReadonlySet<string> = new Set(),
): Array<PublicationCard> {
  const publications: Array<PublicationCard> = [];
  for (const did of followedDids) {
    const owned = publicationsByDid.get(did);
    if (!owned) continue;
    for (const pub of owned) {
      if (subscribedUris.has(pub.uri)) continue;
      publications.push(pub);
    }
  }

  return publications.toSorted((a, b) => {
    const readers = b.subscriberCount - a.subscriberCount;
    if (readers !== 0) return readers;
    const name = a.name.localeCompare(b.name);
    if (name !== 0) return name;
    return a.uri.localeCompare(b.uri);
  });
}

/** Distinct writers behind a ranked list, in the order they first appear. */
export function friendAuthors(
  publications: ReadonlyArray<PublicationCard>,
  limit?: number,
): Array<FriendAuthor> {
  const seen = new Set<string>();
  const authors: Array<FriendAuthor> = [];
  for (const pub of publications) {
    if (seen.has(pub.did)) continue;
    seen.add(pub.did);
    authors.push({
      did: pub.did,
      handle: pub.ownerHandle,
      avatarUrl: pub.ownerAvatarUrl,
    });
    if (limit != null && authors.length >= limit) break;
  }
  return authors;
}

/**
 * The publications behind both tabs of `/friends`: written by someone the
 * reader follows on Bluesky, not already subscribed to, ranked by readership.
 * Shared so the Articles tab describes exactly the same set as the
 * Publications tab rather than a subtly different one.
 */
async function resolveFriendPublications(
  db: Db,
  schema: Schema,
  readerDid: string,
  opts: { candidateLimit?: number } = {},
): Promise<{
  publications: Array<PublicationCard>;
  degraded: boolean;
  truncated: boolean;
}> {
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
    return { publications: [], degraded, truncated };
  }

  const sub = schema.subscriptions;

  const [byAuthor, subscribedRows] = await Promise.all([
    publicationsByAuthors(db, schema, followedDids),
    db
      .select({ uri: sub.publicationUri })
      .from(sub)
      .where(and(eq(sub.subscriberDid, readerDid), eq(sub.deleted, false))),
  ]);
  const subscribed = new Set(subscribedRows.map((row) => row.uri));

  return {
    publications: rankFriendPublications(followedDids, byAuthor, subscribed),
    degraded,
    truncated,
  };
}

/**
 * Publications authored by the Bluesky accounts `readerDid` follows, ranked by
 * readership and paged. Every card carries its owner's handle and avatar, so
 * the author stays visible without grouping the list by person.
 */
export async function friendPublishers(
  db: Db,
  schema: Schema,
  readerDid: string,
  opts: { candidateLimit?: number; limit?: number; offset?: number } = {},
): Promise<FriendPublishers> {
  const limit = opts.limit ?? FRIEND_PAGE_SIZE;
  const offset = opts.offset ?? 0;

  const {
    publications: ranked,
    degraded,
    truncated,
  } = await resolveFriendPublications(db, schema, readerDid, opts);
  if (ranked.length === 0) {
    return { ...EMPTY_FRIEND_PUBLISHERS, degraded, truncated };
  }

  // Headline counts describe the whole match; only a page is serialized —
  // 362 publication cards at once is half a megabyte of JSON otherwise.
  const publicationCount = ranked.length;
  const page = ranked.slice(offset, offset + limit);
  const nextOffset = offset + limit < publicationCount ? offset + limit : null;

  return {
    publications: page,
    publicationCount,
    totalPeople: friendAuthors(ranked).length,
    previewAuthors: friendAuthors(ranked, FRIEND_PREVIEW_AUTHORS),
    nextOffset,
    // Every row on the page is unsubscribed by construction; the client seeds
    // its follow-status cache from this so a page of rows costs no extra
    // requests, and its own optimistic updates still win.
    subscribedUris: [],
    degraded,
    truncated,
  };
}

/**
 * Recent articles from the same publications the Publications tab lists:
 * written by people the reader follows on Bluesky, minus anything already
 * subscribed to (those already arrive on Home). Chronological, newest first.
 */
export async function friendArticles(
  db: Db,
  schema: Schema,
  readerDid: string,
  opts: { candidateLimit?: number; limit?: number; offset?: number } = {},
): Promise<FriendArticles> {
  const limit = opts.limit ?? FRIEND_ARTICLE_PAGE_SIZE;
  const offset = opts.offset ?? 0;

  const { publications, degraded } = await resolveFriendPublications(
    db,
    schema,
    readerDid,
    opts,
  );
  if (publications.length === 0) {
    return { ...EMPTY_FRIEND_ARTICLES, degraded };
  }

  const publicationUris = publications.map((pub) => pub.uri);
  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const pa = alias(schema.profiles, "pa");

  const rows = await db
    .select(articleCardColumns(schema))
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(pr, eq(pr.did, p.did))
    .leftJoin(pa, eq(pa.did, d.did))
    .where(
      and(
        inArray(d.publicationUri, publicationUris),
        eq(d.deleted, false),
        documentPublishedNotInFuture(d),
      ),
    )
    .orderBy(desc(d.publishedAt), desc(d.uri))
    // One past the page so `nextOffset` never promises an empty page.
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const items = rows
    .slice(0, limit)
    .filter(
      (
        row,
      ): row is typeof row & {
        uri: string;
        did: string;
        title: string;
        publishedAt: Date;
      } =>
        row.uri != null &&
        row.did != null &&
        row.title != null &&
        row.publishedAt != null,
    )
    .map((row) => toArticleCard({ ...row, featured: row.featured ?? false }));

  return {
    items,
    nextOffset: hasMore ? offset + limit : null,
    degraded,
  };
}
