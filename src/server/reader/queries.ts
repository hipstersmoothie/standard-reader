/**
 * Shared read-model query helpers for the data layer (`APP_VISION.md` §5).
 *
 * These are pure functions over the Drizzle client + schema (threaded in from a
 * server fn's `dbMiddleware` context), so the same logic backs both the Home
 * rails and the Discover sections without duplicating SQL. The discovery
 * rankings here are reads over the precomputed aggregates (`publication_stats`,
 * `publication_cosubscriptions`, `publication_corecommends`, `documents.trending_score`).
 * Likes (`site.standard.graph.recommend`) feed trending, popularity, and personalized rails
 * alongside subscriptions and Constellation Bluesky backlink counts (precomputed on recompute).
 * Discover rails dedupe against the trending set so Recommended / social-proof
 * rails stay distinct.
 */

import type { SQL } from "drizzle-orm";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type {
  ArticleCard,
  Db,
  PublicationCard,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import {
  articleCardColumns,
  articleQueueCardColumns,
  documentIsCollectionColumn,
  publicationCardColumns,
  publicationSortNameSql,
  toArticleCard,
  toPublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import { EXCLUDED_PUBLICATION_URL_PATTERN } from "#/lib/publication/exclusions";
import { documentPublishedNotInFuture } from "#/server/reader/document-filters";
import {
  discoverEligibleArticleWhere,
  discoverEligiblePublicationWhere,
} from "#/server/reader/publication-filters";
import {
  ROTATION_POOL_MULTIPLIER,
  rotateRail,
  rotationSeed,
} from "#/server/reader/rail-rotation";
import {
  MIN_ARTICLE_RECOMMENDERS,
  TRENDING_MAX_AGE_DAYS,
  WEEK_BACKLINK_WEIGHT,
  WEEK_HALF_LIFE_HOURS,
  applyTrendingDiversityCaps,
  halfLifeDecaySql,
  trendingFetchPoolSize,
} from "#/server/reader/trending-scoring";

/** Blend weights for personalized publication ranking (tunable). */
const RECOMMENDATION_BLEND = {
  cosub: 1,
  corecommend: 1.5,
  coReaderLike: 2,
  coReaderFollow: 2,
} as const;

export interface ArticleCardQuery {
  /** Restrict to documents in these publications (e.g. a reader's follows). */
  publicationUris?: Array<string>;
  /** When set, only documents this DID has NOT marked read (unread filter). */
  unreadForDid?: string;
  /**
   * When set, each card carries this DID's `isRead` flag (computed inline) so
   * the UI can render real read state on first paint without a follow-up query.
   */
  readForDid?: string;
  /** Only documents flagged featured (for the masthead lead). */
  featuredOnly?: boolean;
  /** Only documents that belong to a discover-eligible publication. */
  discoverOnly?: boolean;
  /** Match documents whose `tags` array includes this label (case-insensitive). */
  tag?: string;
  /**
   * Followed-user DIDs. When present (even alongside `publicationUris`), the
   * query switches to "follow-feed union" mode: it returns documents authored
   * by these users OR recommended by them OR belonging to `publicationUris`,
   * ordered by a computed `feedAt` (the document's `publishedAt` for the first
   * two sources, the latest followed-user recommend `createdAt` for the third).
   */
  followedUserDids?: Array<string>;
  /**
   * When false, suppress unread state (dot + `unreadForDid` filter) for
   * documents published before the reader subscribed to their source. Defaults
   * to today's behaviour. See {@link UnreadCutoffOpts}.
   */
  countOldPostsAsUnread?: boolean;
  limit: number;
  offset?: number;
}

/**
 * Options controlling subscription-cutoff suppression of unread state. When
 * `countOldPostsAsUnread` is false, a document published *before* the reader
 * subscribed to its source (publication subscription or author follow) is
 * treated as read — no dot, not counted — without any read record being written
 * (turning the preference back on restores the dot). See
 * `#/lib/count-old-posts-as-unread`. Defaults to today's behaviour: everything
 * a source ever posted counts as unread until read.
 */
export interface UnreadCutoffOpts {
  countOldPostsAsUnread?: boolean;
}

/**
 * Scalar subquery: the earliest moment a source the reader follows began
 * surfacing a document — `min(coalesce(created_at, indexed_at))` across the
 * reader's active subscription to `pubUriExpr` and active user-follow of
 * `authorDidExpr`. `NULL` when the reader follows no source that surfaces the
 * document (e.g. a discover card), so callers treat `NULL` as "no cutoff" and
 * leave the document's unread state unchanged. `pubUriExpr` / `authorDidExpr`
 * are the outer publication-uri / author-did column expressions to correlate on
 * (e.g. `"documents"."publication_uri"`, or a CTE's `cand.publication_uri`).
 */
function readerSourceCutoffSql(
  schema: Schema,
  readerDid: string,
  pubUriExpr: SQL,
  authorDidExpr: SQL,
): SQL {
  const sub = schema.subscriptions;
  const uf = schema.userFollows;
  return sql`(
    select min(cutoff) from (
      select min(coalesce(${sub.createdAt}, ${sub.indexedAt})) as cutoff
      from ${sub}
      where ${sub.subscriberDid} = ${readerDid}
        and ${sub.publicationUri} = ${pubUriExpr}
        and ${sub.deleted} = false
      union all
      select min(coalesce(${uf.createdAt}, ${uf.indexedAt})) as cutoff
      from ${uf}
      where ${uf.followerDid} = ${readerDid}
        and ${uf.subjectDid} = ${authorDidExpr}
        and ${uf.deleted} = false
    ) c
  )`;
}

/**
 * Inline `isRead` for a reader. Qualifies the outer `documents.uri` — unqualified
 * `${d.uri}` in a subquery compiles to `"uri"` and breaks correlation. When
 * `countOldPostsAsUnread` is false, also reports pre-subscription posts as read
 * (see {@link UnreadCutoffOpts}).
 */
function documentReadExistsColumn(
  schema: Schema,
  readForDid: string,
  opts?: UnreadCutoffOpts,
): SQL<boolean> {
  const r = schema.reads;
  const readExists = sql`exists(
    select 1
    from ${r}
    where ${r.documentUri} = "documents"."uri"
      and ${r.ownerDid} = ${readForDid}
      and ${r.deleted} = false
  )`;
  if (opts?.countOldPostsAsUnread === false) {
    const cutoff = readerSourceCutoffSql(
      schema,
      readForDid,
      sql`"documents"."publication_uri"`,
      sql`"documents"."did"`,
    );
    return sql<boolean>`(${readExists} or (
      ${cutoff} is not null and "documents"."published_at" < ${cutoff}
    ))`.mapWith(Boolean);
  }
  return sql<boolean>`${readExists}`.mapWith(Boolean);
}

/**
 * `NOT EXISTS` predicate excluding documents this reader has already read (and,
 * when `countOldPostsAsUnread` is false, documents published before the reader
 * subscribed to their source). Same correlated subquery as
 * {@link documentReadExistsColumn} but as a WHERE condition — used by the weekly
 * digest so it never re-surfaces read articles. A no-op for readers who don't
 * track reading history (no `reads` rows exist).
 */
function documentUnreadWhere(
  schema: Schema,
  readForDid: string,
  opts?: UnreadCutoffOpts,
): SQL {
  const r = schema.reads;
  const notRead = sql`not exists(
    select 1
    from ${r}
    where ${r.documentUri} = "documents"."uri"
      and ${r.ownerDid} = ${readForDid}
      and ${r.deleted} = false
  )`;
  if (opts?.countOldPostsAsUnread === false) {
    const cutoff = readerSourceCutoffSql(
      schema,
      readForDid,
      sql`"documents"."publication_uri"`,
      sql`"documents"."did"`,
    );
    return sql`(${notRead} and (
      ${cutoff} is null or "documents"."published_at" >= ${cutoff}
    ))`;
  }
  return notRead;
}

/**
 * The follow-feed source set as an index-friendly `UNION` of two subqueries,
 * each producing `(uri, published_at, publication_uri, did)` (the latter two let
 * callers correlate the reader's subscription cutoff — see
 * {@link readerSourceCutoffSql}):
 *   1. Direct sources — documents in a followed publication OR authored by a
 *      followed user (served by the publication/author/published indexes).
 *   2. Recommend-sourced — documents recommended by a followed user (a tiny
 *      aggregate over `recommends`, filtered to followed recommenders).
 *
 * Shared by the feed page, the follow counts, and the unread-uri list. Kept as a
 * `UNION` (not an `OR ... EXISTS` predicate) because the OR form forces Postgres
 * to seq-scan `documents` and evaluate a correlated `EXISTS` per row (~1–2s on a
 * large corpus); the union lets each branch use its index. Callers wrap this in
 * a CTE and add their own read-state join / ordering / limit.
 */
function followFeedUnionSql(
  schema: Schema,
  publicationUris: Array<string>,
  followedUserDids: Array<string>,
): SQL {
  const d = schema.documents;
  const rec = schema.recommends;
  const directParts: Array<SQL> = [inArray(d.did, followedUserDids)];
  if (publicationUris.length > 0) {
    directParts.push(inArray(d.publicationUri, publicationUris));
  }
  const directOr = or(...directParts) ?? sql`false`;
  const base = and(eq(d.deleted, false), documentPublishedNotInFuture(d));
  return sql`(
    select ${d.uri} as uri, ${d.publishedAt} as published_at,
           ${d.publicationUri} as publication_uri, ${d.did} as did
    from ${d}
    where ${base} and (${directOr})
    union
    select ${d.uri} as uri, ${d.publishedAt} as published_at,
           ${d.publicationUri} as publication_uri, ${d.did} as did
    from ${d}
    join ${creditedDocumentUrisSql(schema, followedUserDids)} fc
      on fc.document_uri = ${d.uri}
    where ${base}
    union
    select ${d.uri} as uri, ${d.publishedAt} as published_at,
           ${d.publicationUri} as publication_uri, ${d.did} as did
    from ${d}
    join (
      select ${rec.documentUri} as document_uri
      from ${rec}
      where ${inArray(rec.recommenderDid, followedUserDids)} and ${eq(rec.deleted, false)}
      group by ${rec.documentUri}
    ) fr on fr.document_uri = ${d.uri}
    where ${base}
  )`;
}

/**
 * Documents crediting any of these DIDs as a contributor
 * (`site.standard.document#contributor[]`) — guest posts and co-writes that live
 * in someone *else's* repo, so `documents.did` never names them.
 *
 * Always joined as its own union branch, never `or`-ed against
 * `documents.did`: the `or` is unindexable and costs a full seq-scan of
 * `documents` (see {@link followFeedUnionSql}). This branch rides
 * `document_contributors_did_idx` and is empty for most readers' follow sets.
 */
function creditedDocumentUrisSql(schema: Schema, dids: Array<string>): SQL {
  const dc = schema.documentContributors;
  return sql`(
    select ${dc.documentUri} as document_uri
    from ${dc}
    where ${inArray(dc.did, dids)}
    group by ${dc.documentUri}
  )`;
}

/** Read rows off a drizzle `db.execute` result (array or `{ rows }`). */
function executeRows<T>(result: unknown): Array<T> {
  if (Array.isArray(result)) return result as Array<T>;
  return ((result as { rows?: Array<T> }).rows ?? []) as Array<T>;
}

/**
 * Ordered page of document URIs for the follow-feed union, computed cheaply.
 *
 * The naive union — `WHERE pub OR author OR recommended ORDER BY <computed feedAt>`
 * — is unindexable on the sort key, so Postgres materializes and sorts every
 * matching row (100k+ for an active reader). Instead we union two index-friendly
 * branches and take the top of each:
 *   1. Direct sources (followed publications OR authored-by-followed) ordered by
 *      `published_at` — served by the published/publication/author indexes.
 *   2. Recommend-sourced — a tiny aggregate over `recommends` (followed
 *      recommenders only) ordered by the recommend time.
 * Merging two `limit+offset`-capped branches sorts at most `2·(limit+offset)`
 * rows, turning a ~2s scan into a ~100ms keyset read. `feedAt` = the doc's
 * publish time for direct sources, the latest followed recommend time otherwise.
 */
async function selectFollowFeedCandidateUris(
  db: Db,
  schema: Schema,
  opts: {
    publicationUris: Array<string>;
    followedUserDids: Array<string>;
    featuredOnly?: boolean;
    unreadForDid?: string;
    countOldPostsAsUnread?: boolean;
    limit: number;
    offset: number;
  },
): Promise<Array<string>> {
  const d = schema.documents;
  const rec = schema.recommends;
  const { publicationUris, followedUserDids } = opts;
  const k = opts.limit + opts.offset;

  const base: Array<SQL> = [
    eq(d.deleted, false),
    documentPublishedNotInFuture(d),
  ];
  if (opts.featuredOnly) base.push(eq(d.featured, true));
  if (opts.unreadForDid)
    base.push(
      documentUnreadWhere(schema, opts.unreadForDid, {
        countOldPostsAsUnread: opts.countOldPostsAsUnread,
      }),
    );
  const baseWhere = and(...base) ?? sql`true`;

  const directParts: Array<SQL> = [inArray(d.did, followedUserDids)];
  if (publicationUris.length > 0) {
    directParts.push(inArray(d.publicationUri, publicationUris));
  }
  const directOr = or(...directParts) ?? sql`false`;

  // `union all` + `distinct on (uri)` de-dupes by document (a doc that is both a
  // direct source and recommended by a followed user would otherwise appear
  // twice, since its two rows carry different `feed_at`). `src=0` (direct) sorts
  // before `src=1` (recommend), so a doc that is both keeps its publish time.
  // The contributor branch is `src=0` too: a guest post is a direct source, so
  // it belongs at its publish time, not at whenever someone recommended it.
  const rows = await db.execute<{ uri: string }>(sql`
    select deduped.uri from (
      select distinct on (u.uri) u.uri as uri, u.feed_at as feed_at
      from (
        (
          select ${d.uri} as uri, ${d.publishedAt} as feed_at, 0 as src
          from ${d}
          where ${baseWhere} and (${directOr})
          order by ${d.publishedAt} desc nulls last, ${d.uri} desc
          limit ${k}
        )
        union all
        (
          select ${d.uri} as uri, ${d.publishedAt} as feed_at, 0 as src
          from ${d}
          join ${creditedDocumentUrisSql(schema, followedUserDids)} fc
            on fc.document_uri = ${d.uri}
          where ${baseWhere}
          order by ${d.publishedAt} desc nulls last, ${d.uri} desc
          limit ${k}
        )
        union all
        (
          select ${d.uri} as uri, fr.rec_at as feed_at, 1 as src
          from ${d}
          join (
            select ${rec.documentUri} as document_uri, max(${rec.createdAt}) as rec_at
            from ${rec}
            where ${inArray(rec.recommenderDid, followedUserDids)} and ${eq(rec.deleted, false)}
            group by ${rec.documentUri}
          ) fr on fr.document_uri = ${d.uri}
          where ${baseWhere}
          order by fr.rec_at desc nulls last
          limit ${k}
        )
      ) u
      order by u.uri, u.src asc
    ) deduped
    order by deduped.feed_at desc nulls last, deduped.uri desc
    limit ${opts.limit} offset ${opts.offset}
  `);

  return executeRows<{ uri: string }>(rows).map((row) => row.uri);
}

/**
 * Newest-first {@link ArticleCard}s, filtered to follows / unread / featured /
 * discover-eligible as requested. Excludes posts whose `publishedAt` is still in
 * the future. Returns `[]` when `publicationUris` is set but empty (a reader with
 * no follows), avoiding an `IN ()` that can never match.
 *
 * When `followedUserDids` is non-empty the query runs in follow-feed union mode:
 * publication-sourced + author-sourced + recommend-sourced documents merged and
 * ordered by a computed `feedAt` (publish time for direct sources; latest
 * followed-user recommend time for recommend-sourced rows).
 */
export async function selectArticleCards(
  db: Db,
  schema: Schema,
  opts: ArticleCardQuery,
): Promise<Array<ArticleCard>> {
  const followedUserDids = opts.followedUserDids ?? [];
  const hasFollowedUsers = followedUserDids.length > 0;
  // A follows query with no publications AND no followed users has no sources —
  // short-circuit (an empty `IN ()` can never match). In union mode an empty
  // publication set is fine as long as there are followed users.
  if (
    opts.publicationUris &&
    opts.publicationUris.length === 0 &&
    !hasFollowedUsers
  ) {
    return [];
  }

  const pubUris = opts.publicationUris ?? [];

  // Follow-feed union mode: documents authored by a followed user, OR in a
  // followed publication, OR recommended by a followed user. Resolve the page's
  // URIs with the cheap index-friendly union first, then hydrate display columns
  // for just that page — avoids sorting the whole (huge) match set by a
  // non-indexable computed timestamp.
  if (hasFollowedUsers) {
    const candidateUris = await selectFollowFeedCandidateUris(db, schema, {
      publicationUris: pubUris,
      followedUserDids,
      featuredOnly: opts.featuredOnly,
      unreadForDid: opts.unreadForDid,
      countOldPostsAsUnread: opts.countOldPostsAsUnread,
      limit: opts.limit,
      offset: opts.offset ?? 0,
    });
    const pageUris = [...new Set(candidateUris)]; // defensive: never render a doc twice
    return selectArticleCardsByUris(db, schema, pageUris, {
      readForDid: opts.readForDid,
      countOldPostsAsUnread: opts.countOldPostsAsUnread,
    });
  }

  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const pa = alias(schema.profiles, "pa");
  const r = schema.reads;

  const conds = [eq(d.deleted, false), documentPublishedNotInFuture(d)];

  if (opts.publicationUris) {
    conds.push(inArray(d.publicationUri, opts.publicationUris));
  }
  if (opts.featuredOnly) {
    conds.push(eq(d.featured, true));
  }
  if (opts.discoverOnly) {
    // Loose documents (publicationUri IS NULL, no publication row) are
    // discover-eligible; publication-bound documents must be on a discover-
    // eligible publication. `p` is leftJoin'd below, so loose docs surface as
    // `p.uri IS NULL` and pass the `or(isNull(p.uri), …)` clause.
    conds.push(discoverEligibleArticleWhere(p));
  }
  if (opts.tag) {
    conds.push(documentCarriesTagWhere(d, opts.tag));
  }

  const columns = articleCardColumns(schema);
  const selection = opts.readForDid
    ? {
        ...columns,
        isRead: documentReadExistsColumn(schema, opts.readForDid, {
          countOldPostsAsUnread: opts.countOldPostsAsUnread,
        }),
      }
    : columns;

  let query = db
    .select(selection)
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(pr, eq(pr.did, p.did))
    .leftJoin(pa, eq(pa.did, d.did))
    .$dynamic();

  if (opts.unreadForDid) {
    query = query.leftJoin(
      r,
      and(
        eq(r.documentUri, d.uri),
        eq(r.ownerDid, opts.unreadForDid),
        eq(r.deleted, false),
      ),
    );
    conds.push(isNull(r.uri));
    if (opts.countOldPostsAsUnread === false) {
      const cutoff = readerSourceCutoffSql(
        schema,
        opts.unreadForDid,
        sql`${d.publicationUri}`,
        sql`${d.did}`,
      );
      conds.push(sql`(${cutoff} is null or ${d.publishedAt} >= ${cutoff})`);
    }
  }

  const rows = await query
    .where(and(...conds))
    .orderBy(...documentsNewestFirst(d))
    .limit(opts.limit)
    .offset(opts.offset ?? 0);

  return rows.map((row) => toArticleCard(row));
}

/**
 * Article cards for a single publication profile — documents table only (no
 * publication/profile join). Publication-scoped pages set `showByline={false}`,
 * so per-card publication metadata is omitted.
 */
export async function selectPublicationArticleCards(
  db: Db,
  schema: Schema,
  opts: {
    publicationUri: string;
    limit: number;
    offset?: number;
    /** Inline read flag for the requesting reader (see {@link ArticleCardQuery.readForDid}). */
    readForDid?: string;
    /** When false, treat posts published before the reader subscribed to this
     * publication as read (see {@link UnreadCutoffOpts}). */
    countOldPostsAsUnread?: boolean;
  },
): Promise<Array<ArticleCard>> {
  const d = schema.documents;
  const rec = schema.recommends;

  const baseSelection = {
    uri: d.uri,
    did: d.did,
    title: d.title,
    description: d.description,
    path: d.path,
    canonicalUrl: d.canonicalUrl,
    coverImageCid: d.coverImageCid,
    publishedAt: d.publishedAt,
    featured: d.featured,
    publicationUri: d.publicationUri,
    tags: d.tags,
    hasRenderableBody: d.hasRenderableBody,
    isCollection: documentIsCollectionColumn(d.collectionJson),
    // Qualify the outer `documents.uri` — unqualified `${d.uri}` in a
    // subquery compiles to `"uri"` and breaks correlation without a join.
    recommendCount: sql<number>`coalesce((
        select count(*)::int
        from ${rec}
        where ${rec.documentUri} = "documents"."uri"
          and ${rec.deleted} = false
      ), 0)`.mapWith(Number),
  };

  const selection = opts.readForDid
    ? {
        ...baseSelection,
        isRead: documentReadExistsColumn(schema, opts.readForDid, {
          countOldPostsAsUnread: opts.countOldPostsAsUnread,
        }),
      }
    : baseSelection;

  const rows = await db
    .select(selection)
    .from(d)
    .where(
      and(
        eq(d.deleted, false),
        documentPublishedNotInFuture(d),
        eq(d.publicationUri, opts.publicationUri),
      ),
    )
    .orderBy(...documentsNewestFirst(d))
    .limit(opts.limit)
    .offset(opts.offset ?? 0);

  return rows.map((row) =>
    toArticleCard({
      ...row,
      // The publication page never renders card bodies — skipping textContent
      // keeps full essays out of the profile payload and SSR dehydration.
      textContent: null,
      publicationName: null,
      publicationIconCid: null,
      publicationDid: null,
      publicationOwnerAvatarUrl: null,
      publicationOwnerHandle: null,
      publicationBannerUrl: null,
      publicationTopic: null,
      // These documents belong to a publication, so the author-byline fields
      // (used only for loose docs) are not needed here.
      authorHandle: null,
      authorAvatarUrl: null,
      authorDisplayName: null,
    }),
  );
}

/**
 * How many unread URIs a single "mark all as read" pass will claim when the
 * caller doesn't specify. Callers that write these to the PDS batch them, so
 * this is a throughput/latency choice rather than a protocol limit — a reader
 * with a backlog deeper than this still needs more than one pass.
 */
const DEFAULT_UNREAD_URI_LIMIT = 200;

/** Unread document AT-URIs for a reader, optionally scoped to publications
 * and/or followed users (union — matches the follow feed). */
export async function selectUnreadDocumentUris(
  db: Db,
  schema: Schema,
  opts: {
    readerDid: string;
    publicationUris?: Array<string>;
    followedUserDids?: Array<string>;
    countOldPostsAsUnread?: boolean;
    limit?: number;
  },
): Promise<Array<string>> {
  const {
    readerDid,
    publicationUris,
    followedUserDids,
    countOldPostsAsUnread,
    limit = DEFAULT_UNREAD_URI_LIMIT,
  } = opts;
  const hasFollowedUsers = (followedUserDids?.length ?? 0) > 0;
  if (publicationUris && publicationUris.length === 0 && !hasFollowedUsers) {
    return [];
  }

  const d = schema.documents;
  const r = schema.reads;

  // Union mode: unread URIs from the index-friendly source union (avoids the
  // correlated OR ... EXISTS scan).
  if (hasFollowedUsers) {
    const cutoffFilter =
      countOldPostsAsUnread === false
        ? sql`and (${readerSourceCutoffSql(schema, readerDid, sql`cand.publication_uri`, sql`cand.did`)} is null
            or cand.published_at >= ${readerSourceCutoffSql(schema, readerDid, sql`cand.publication_uri`, sql`cand.did`)})`
        : sql``;
    const rows = await db.execute(sql`
      with cand as ${followFeedUnionSql(schema, publicationUris ?? [], followedUserDids ?? [])}
      select cand.uri
      from cand
      left join ${r} on ${r.documentUri} = cand.uri
        and ${r.ownerDid} = ${readerDid} and ${r.deleted} = false
      where ${r.uri} is null ${cutoffFilter}
      order by cand.published_at desc nulls last, cand.uri desc
      limit ${limit}
    `);
    return executeRows<{ uri: string }>(rows).map((row) => row.uri);
  }

  const conds = [eq(d.deleted, false), documentPublishedNotInFuture(d)];
  if (publicationUris) {
    conds.push(inArray(d.publicationUri, publicationUris));
  }
  if (countOldPostsAsUnread === false) {
    const cutoff = readerSourceCutoffSql(
      schema,
      readerDid,
      sql`${d.publicationUri}`,
      sql`${d.did}`,
    );
    conds.push(sql`(${cutoff} is null or ${d.publishedAt} >= ${cutoff})`);
  }

  const rows = await db
    .select({ uri: d.uri })
    .from(d)
    .leftJoin(
      r,
      and(
        eq(r.documentUri, d.uri),
        eq(r.ownerDid, readerDid),
        eq(r.deleted, false),
      ),
    )
    .where(and(...conds, isNull(r.uri)))
    .orderBy(...documentsNewestFirst(d))
    .limit(limit);

  return rows.map((row) => row.uri);
}

/**
 * The reader's followed publications as {@link PublicationCard}s, ordered by
 * most recent document activity — backs the sidebar "Following" list. Returns
 * `[]` for readers with no follows.
 */
export async function followedPublications(
  db: Db,
  schema: Schema,
  publicationUris: Array<string>,
): Promise<Array<PublicationCard>> {
  if (publicationUris.length === 0) {
    return [];
  }
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;
  const sortName = publicationSortNameSql(p.name, p.url);
  const rows = await db
    .select(publicationCardColumns(schema))
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(inArray(p.uri, publicationUris), eq(p.deleted, false)))
    .orderBy(
      sql`${st.lastDocumentAt} desc nulls last`,
      asc(sortName),
      asc(p.uri),
    );
  return rows.map((row) => toPublicationCard(row));
}

/** Distinct publication AT-URIs a reader currently follows (active records). */
export async function selectFollowUris(
  db: Db,
  schema: Schema,
  did: string,
): Promise<Array<string>> {
  const sub = schema.subscriptions;
  const rows = await db
    .selectDistinct({ uri: sub.publicationUri })
    .from(sub)
    .where(and(eq(sub.subscriberDid, did), eq(sub.deleted, false)));
  return rows.map((row) => row.uri);
}

/**
 * Cheap boolean: does the reader have any follows at all — a subscription, a
 * followed user, or a saved list? One round trip of indexed `EXISTS` probes,
 * for gates (the welcome-redirect) that only need the boolean, not the full
 * (expensive) sidebar computation.
 */
export async function readerHasAnyFollows(
  db: Db,
  schema: Schema,
  did: string,
): Promise<boolean> {
  const sub = schema.subscriptions;
  const uf = schema.userFollows;
  const ls = schema.listSaves;
  const result = await db.execute(sql`
    select (
      exists(select 1 from ${sub} where ${sub.subscriberDid} = ${did} and ${sub.deleted} = false)
      or exists(select 1 from ${uf} where ${uf.followerDid} = ${did} and ${uf.deleted} = false)
      or exists(select 1 from ${ls} where ${ls.saverDid} = ${did} and ${ls.deleted} = false)
    ) as has
  `);
  return executeRows<{ has: boolean }>(result)[0]?.has ?? false;
}

/** Distinct DIDs of the users a reader currently follows (active records). */
export async function selectFollowedUserDids(
  db: Db,
  schema: Schema,
  did: string,
): Promise<Array<string>> {
  const uf = schema.userFollows;
  const rows = await db
    .selectDistinct({ did: uf.subjectDid })
    .from(uf)
    .where(and(eq(uf.followerDid, did), eq(uf.deleted, false)));
  return rows.map((row) => row.did);
}

/** Count of unread documents across a reader's follows (for the Latest filter).
 * Union of followed publications + followed users (authored + recommended), so
 * the badge matches the follow feed. A document recommended by several followed
 * users is counted once (`count(*)` over one row per document). */
export async function countFollowedDocuments(
  db: Db,
  schema: Schema,
  publicationUris: Array<string>,
  did: string,
  followedUserDids: Array<string> = [],
  opts?: UnreadCutoffOpts,
): Promise<{ all: number; unread: number }> {
  if (publicationUris.length === 0 && followedUserDids.length === 0) {
    return { all: 0, unread: 0 };
  }
  const r = schema.reads;
  const suppressOld = opts?.countOldPostsAsUnread === false;
  const sub = schema.subscriptions;
  const uf = schema.userFollows;

  // No followed users → the fast publication-only path (indexed `IN`). When
  // suppressing old posts, left-join the per-publication subscription cutoff so
  // the unread tally excludes posts published before the reader subscribed.
  if (followedUserDids.length === 0) {
    const d = schema.documents;
    const cutoffJoin = suppressOld
      ? sql`left join (
          select ${sub.publicationUri} as publication_uri,
                 min(coalesce(${sub.createdAt}, ${sub.indexedAt})) as cutoff
          from ${sub}
          where ${sub.subscriberDid} = ${did} and ${sub.deleted} = false
          group by ${sub.publicationUri}
        ) sc on sc.publication_uri = ${d.publicationUri}`
      : sql``;
    const cutoffPred = suppressOld
      ? sql`and (sc.cutoff is null or ${d.publishedAt} >= sc.cutoff)`
      : sql``;
    const result = await db.execute(sql`
      select
        count(*)::int as all,
        count(*) filter (where ${r.uri} is null ${cutoffPred})::int as unread
      from ${d}
      left join ${r} on ${r.documentUri} = ${d.uri}
        and ${r.ownerDid} = ${did} and ${r.deleted} = false
      ${cutoffJoin}
      where ${d.deleted} = false
        and ${documentPublishedNotInFuture(d)}
        and ${inArray(d.publicationUri, publicationUris)}
    `);
    const [row] = executeRows<{ all: number; unread: number }>(result);
    return { all: row?.all ?? 0, unread: row?.unread ?? 0 };
  }

  // Union mode: count distinct documents from the index-friendly source union,
  // joining reads for the unread tally (avoids the correlated OR ... EXISTS scan).
  // When suppressing old posts, take the earliest of the publication-subscription
  // and author-follow cutoffs (`least` ignores nulls) as the document's cutoff.
  const cutoffJoins = suppressOld
    ? sql`left join (
        select ${sub.publicationUri} as publication_uri,
               min(coalesce(${sub.createdAt}, ${sub.indexedAt})) as cutoff
        from ${sub}
        where ${sub.subscriberDid} = ${did} and ${sub.deleted} = false
        group by ${sub.publicationUri}
      ) sc on sc.publication_uri = cand.publication_uri
      left join (
        select ${uf.subjectDid} as subject_did,
               min(coalesce(${uf.createdAt}, ${uf.indexedAt})) as cutoff
        from ${uf}
        where ${uf.followerDid} = ${did} and ${uf.deleted} = false
        group by ${uf.subjectDid}
      ) uc on uc.subject_did = cand.did`
    : sql``;
  const cutoffPred = suppressOld
    ? sql`and (least(sc.cutoff, uc.cutoff) is null
        or cand.published_at >= least(sc.cutoff, uc.cutoff))`
    : sql``;
  const result = await db.execute(sql`
    with cand as ${followFeedUnionSql(schema, publicationUris, followedUserDids)}
    select
      count(*)::int as all,
      count(*) filter (where ${r.uri} is null ${cutoffPred})::int as unread
    from cand
    left join ${r} on ${r.documentUri} = cand.uri
      and ${r.ownerDid} = ${did} and ${r.deleted} = false
    ${cutoffJoins}
  `);
  const [row] = executeRows<{ all: number; unread: number }>(result);
  return { all: row?.all ?? 0, unread: row?.unread ?? 0 };
}

/** Count of discover-eligible documents across the whole network (Latest "All" tab). */
export async function countNetworkDocuments(
  db: Db,
  schema: Schema,
): Promise<number> {
  const d = schema.documents;
  const p = schema.publications;
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .where(
      and(
        eq(d.deleted, false),
        documentPublishedNotInFuture(d),
        discoverEligibleArticleWhere(p),
      ),
    );
  return row?.count ?? 0;
}

/** Unread document counts keyed by publication AT-URI for a reader's follows.
 * When `countOldPostsAsUnread` is false, posts published before the reader
 * subscribed to a publication are excluded from its tally. */
export async function countUnreadByPublication(
  db: Db,
  schema: Schema,
  publicationUris: Array<string>,
  did: string,
  opts?: UnreadCutoffOpts,
): Promise<Map<string, number>> {
  if (publicationUris.length === 0) {
    return new Map();
  }
  const d = schema.documents;
  const r = schema.reads;
  const sub = schema.subscriptions;
  const suppressOld = opts?.countOldPostsAsUnread === false;

  const cutoffJoin = suppressOld
    ? sql`left join (
        select ${sub.publicationUri} as publication_uri,
               min(coalesce(${sub.createdAt}, ${sub.indexedAt})) as cutoff
        from ${sub}
        where ${sub.subscriberDid} = ${did} and ${sub.deleted} = false
          and ${inArray(sub.publicationUri, publicationUris)}
        group by ${sub.publicationUri}
      ) sc on sc.publication_uri = ${d.publicationUri}`
    : sql``;
  const cutoffPred = suppressOld
    ? sql`and (sc.cutoff is null or ${d.publishedAt} >= sc.cutoff)`
    : sql``;

  const result = await db.execute(sql`
    select ${d.publicationUri} as publication_uri,
      count(*) filter (where ${r.uri} is null ${cutoffPred})::int as unread
    from ${d}
    left join ${r} on ${r.documentUri} = ${d.uri}
      and ${r.ownerDid} = ${did} and ${r.deleted} = false
    ${cutoffJoin}
    where ${d.deleted} = false
      and ${documentPublishedNotInFuture(d)}
      and ${inArray(d.publicationUri, publicationUris)}
      and ${d.publicationUri} is not null
    group by ${d.publicationUri}
  `);

  return new Map(
    executeRows<{ publication_uri: string | null; unread: number }>(
      result,
    ).flatMap((row) =>
      row.publication_uri ? [[row.publication_uri, row.unread]] : [],
    ),
  );
}

/**
 * Unread document counts keyed by followed-user DID — the sidebar "People"
 * badges. A user contributes a document if they authored it OR recommended it;
 * `(did, uri)` pairs are de-duped so a user's own recommend of their own post
 * counts once. Bounded by the followed users' content, so cheap.
 */
export async function countUnreadByFollowedUser(
  db: Db,
  schema: Schema,
  followedUserDids: Array<string>,
  did: string,
  opts?: UnreadCutoffOpts,
): Promise<Map<string, number>> {
  if (followedUserDids.length === 0) {
    return new Map();
  }
  const d = schema.documents;
  const rec = schema.recommends;
  const dc = schema.documentContributors;
  const r = schema.reads;
  const uf = schema.userFollows;
  const base = and(eq(d.deleted, false), documentPublishedNotInFuture(d));
  const suppressOld = opts?.countOldPostsAsUnread === false;

  // When suppressing old posts, the cutoff for a contributor is when the reader
  // followed them (documents from before that count as caught-up).
  const cutoffJoin = suppressOld
    ? sql`left join (
        select ${uf.subjectDid} as subject_did,
               min(coalesce(${uf.createdAt}, ${uf.indexedAt})) as cutoff
        from ${uf}
        where ${uf.followerDid} = ${did} and ${uf.deleted} = false
        group by ${uf.subjectDid}
      ) uc on uc.subject_did = contrib.contributor`
    : sql``;
  const cutoffPred = suppressOld
    ? sql`and (uc.cutoff is null or contrib.published_at >= uc.cutoff)`
    : sql``;

  const result = await db.execute(sql`
    with contrib as (
      select ${d.did} as contributor, ${d.uri} as uri,
             ${d.publishedAt} as published_at
      from ${d}
      where ${base} and ${inArray(d.did, followedUserDids)}
      union
      select ${dc.did} as contributor, ${d.uri} as uri,
             ${d.publishedAt} as published_at
      from ${dc}
      join ${d} on ${d.uri} = ${dc.documentUri}
      where ${base} and ${inArray(dc.did, followedUserDids)}
      union
      select ${rec.recommenderDid} as contributor, ${d.uri} as uri,
             ${d.publishedAt} as published_at
      from ${rec}
      join ${d} on ${d.uri} = ${rec.documentUri}
      where ${base} and ${inArray(rec.recommenderDid, followedUserDids)}
        and ${eq(rec.deleted, false)}
    )
    select contrib.contributor as contributor, count(*)::int as unread
    from contrib
    left join ${r} on ${r.documentUri} = contrib.uri
      and ${r.ownerDid} = ${did} and ${r.deleted} = false
    ${cutoffJoin}
    where ${r.uri} is null ${cutoffPred}
    group by contrib.contributor
  `);

  return new Map(
    executeRows<{ contributor: string; unread: number }>(result).map((row) => [
      row.contributor,
      row.unread,
    ]),
  );
}

// ── Discovery rails (reads over precomputed aggregates) ─────────────────────

/** `rail` = strict engagement floor + diversity; `page` = score-ranked recency window. */
export type TrendingArticlesScope = "rail" | "page";

/**
 * Discover-eligible articles ranked by precomputed `documents.trending_score`
 * (recomputed on the cron pass). Cheap read: recency gate + engagement floor +
 * diversity caps only.
 */
export interface TrendingArticlesQuery {
  excludeUris?: Array<string>;
  offset?: number;
  readForDid?: string;
  scope?: TrendingArticlesScope;
}

function trendingArticleWhere(
  schema: Schema,
  scope: TrendingArticlesScope,
  excludeUris: Array<string> = [],
) {
  const d = schema.documents;
  const p = schema.publications;

  const conds = [
    eq(d.deleted, false),
    // Loose documents (no publication) are eligible; publication-bound ones
    // must be on a discover-eligible publication. `p` is leftJoin'd in the
    // trending query builders.
    discoverEligibleArticleWhere(p),
    documentPublishedNotInFuture(d),
    sql`${d.publishedAt} > now() - (${TRENDING_MAX_AGE_DAYS}::text || ' days')::interval`,
  ];

  if (scope === "rail") {
    conds.push(
      sql`${d.trendingScore} > 0`,
      sql`${d.distinctRecommenderCount} >= ${MIN_ARTICLE_RECOMMENDERS}`,
    );
  }

  if (excludeUris.length > 0) {
    conds.push(notInArray(d.uri, excludeUris));
  }

  return conds;
}

function trendingArticleSelection(schema: Schema, readForDid?: string) {
  const columns = articleCardColumns(schema);

  return readForDid
    ? {
        ...columns,
        isRead: documentReadExistsColumn(schema, readForDid),
      }
    : columns;
}

export async function trendingArticles(
  db: Db,
  schema: Schema,
  limit: number,
  {
    excludeUris = [],
    offset = 0,
    readForDid,
    scope = "rail",
  }: TrendingArticlesQuery = {},
): Promise<Array<ArticleCard>> {
  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const pa = alias(schema.profiles, "pa");

  if (scope === "page") {
    const rows = await db
      .select(trendingArticleSelection(schema, readForDid))
      .from(d)
      .leftJoin(p, eq(p.uri, d.publicationUri))
      .leftJoin(pr, eq(pr.did, p.did))
      .leftJoin(pa, eq(pa.did, d.did))
      .where(and(...trendingArticleWhere(schema, scope, excludeUris)))
      .orderBy(desc(d.trendingScore), desc(d.publishedAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => toArticleCard(row));
  }

  const totalNeeded = offset + limit;
  const poolSize = trendingFetchPoolSize(totalNeeded);

  const rows = await db
    .select(trendingArticleSelection(schema, readForDid))
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(pr, eq(pr.did, p.did))
    .leftJoin(pa, eq(pa.did, d.did))
    .where(and(...trendingArticleWhere(schema, scope, excludeUris)))
    .orderBy(desc(d.trendingScore), desc(d.publishedAt))
    .limit(poolSize);

  const cards = rows.map((row) => toArticleCard(row));
  const capped = applyTrendingDiversityCaps(cards, totalNeeded);
  return capped.slice(offset, offset + limit);
}

/**
 * "Best of your follows" for the weekly digest: articles from the reader's
 * followed publications, published within the last `sinceDays`, ranked by the
 * precomputed `documents.trending_score` (recommends + velocity + freshness +
 * backlinks) and passed through the same per-publication / per-author diversity
 * caps as the Discover trending rail so one prolific follow can't dominate.
 *
 * Unlike {@link trendingArticles} this is NOT gated on discover-eligibility or
 * an engagement floor — everything from a publication you chose to follow is
 * fair game; we only rank it. Returns `[]` for a reader with no follows.
 */
export async function bestOfFollows(
  db: Db,
  schema: Schema,
  {
    publicationUris,
    sinceDays,
    limit,
    readForDid,
    excludeReadForDid,
  }: {
    publicationUris: Array<string>;
    sinceDays: number;
    limit: number;
    readForDid?: string;
    /** Omit documents this reader has already read (weekly digest). */
    excludeReadForDid?: string;
  },
): Promise<Array<ArticleCard>> {
  if (publicationUris.length === 0) return [];

  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const pa = alias(schema.profiles, "pa");

  const conds = [
    eq(d.deleted, false),
    documentPublishedNotInFuture(d),
    inArray(d.publicationUri, publicationUris),
    sql`${d.publishedAt} > now() - (${sinceDays}::text || ' days')::interval`,
  ];
  if (excludeReadForDid) {
    conds.push(documentUnreadWhere(schema, excludeReadForDid));
  }

  const rows = await db
    .select(trendingArticleSelection(schema, readForDid))
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(pr, eq(pr.did, p.did))
    .leftJoin(pa, eq(pa.did, d.did))
    .where(and(...conds))
    .orderBy(desc(d.trendingScore), desc(d.publishedAt))
    .limit(trendingFetchPoolSize(limit));

  const cards = rows.map((row) => toArticleCard(row));
  return applyTrendingDiversityCaps(cards, limit).slice(0, limit);
}

/**
 * "Top on the network this week" for the weekly digest: the best discover-
 * eligible articles across the whole network, published within the last
 * `sinceDays`, ranked by `documents.trending_score` with the same diversity
 * caps. Like {@link bestOfFollows} but network-wide (no follow filter, discover-
 * eligible only). Pass `excludeUris` (the reader's best-of picks) so the same
 * article never appears in both sections.
 */
export async function topNetworkArticles(
  db: Db,
  schema: Schema,
  {
    sinceDays,
    limit,
    excludeUris = [],
    excludeReadForDid,
  }: {
    sinceDays: number;
    limit: number;
    excludeUris?: Array<string>;
    /** Omit documents this reader has already read (weekly digest). */
    excludeReadForDid?: string;
  },
): Promise<Array<ArticleCard>> {
  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const pa = alias(schema.profiles, "pa");

  const conds = [
    eq(d.deleted, false),
    discoverEligibleArticleWhere(p),
    documentPublishedNotInFuture(d),
    sql`${d.publishedAt} > now() - (${sinceDays}::text || ' days')::interval`,
  ];
  if (excludeUris.length > 0) {
    conds.push(notInArray(d.uri, excludeUris));
  }
  if (excludeReadForDid) {
    conds.push(documentUnreadWhere(schema, excludeReadForDid));
  }

  const rows = await db
    .select(trendingArticleSelection(schema))
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(pr, eq(pr.did, p.did))
    .leftJoin(pa, eq(pa.did, d.did))
    .where(and(...conds))
    .orderBy(desc(d.trendingScore), desc(d.publishedAt))
    .limit(trendingFetchPoolSize(limit));

  const cards = rows.map((row) => toArticleCard(row));
  return applyTrendingDiversityCaps(cards, limit).slice(0, limit);
}

/**
 * The reader's most recently saved-for-later articles (`app.standard-reader.bookmark`
 * records), newest first, for the weekly digest's "Saved for later" section.
 *
 * Unlike {@link bestOfFollows} / {@link topNetworkArticles} there's no time
 * window, trending rank, or diversity cap — it's a straight recency read of the
 * reader's own bookmarks, mirroring the in-app "Saved for later" queue. Deleted
 * bookmarks and deleted documents are excluded; pass `excludeUris` (the picks
 * already shown in earlier sections) so a saved article isn't repeated.
 */
export async function savedForLater(
  db: Db,
  schema: Schema,
  {
    did,
    limit,
    excludeUris = [],
  }: {
    did: string;
    limit: number;
    excludeUris?: Array<string>;
  },
): Promise<Array<ArticleCard>> {
  const b = schema.bookmarks;
  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const pa = alias(schema.profiles, "pa");

  const conds = [
    eq(b.ownerDid, did),
    eq(b.deleted, false),
    eq(d.deleted, false),
  ];
  if (excludeUris.length > 0) {
    conds.push(notInArray(d.uri, excludeUris));
  }

  const rows = await db
    .select(articleCardColumns(schema))
    .from(b)
    .innerJoin(d, eq(d.uri, b.documentUri))
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(pr, eq(pr.did, p.did))
    .leftJoin(pa, eq(pa.did, d.did))
    .where(and(...conds))
    // NULLS LAST matches `bookmarks_owner_idx` (see the getSaved handler).
    .orderBy(sql`${b.createdAt} desc nulls last`)
    .limit(limit);

  return rows.map((row) => toArticleCard(row));
}

/**
 * "Week in review" ranking, shared by the weekly Bluesky thread and the weekly
 * digest's "Top on the network this week" section: the biggest discover-eligible
 * articles across the whole network over the last `sinceDays`, ranked by
 * engagement ACCUMULATED across the window rather than by `trending_score`.
 *
 * Unlike {@link topNetworkArticles} (which orders by the precomputed
 * `trending_score` — a 30h half-life, freshness-weighted, 4-day-gated "hot right
 * now" signal that collapses toward the last day or two) this computes the score
 * live from `recommends` with a gentler {@link WEEK_HALF_LIFE_HOURS} (~3.5 day)
 * decay and no published-at freshness term, so a heavily-liked early-week article
 * can out-rank a barely-liked fresh one. The score blends decay-weighted distinct
 * likes with {@link WEEK_BACKLINK_WEIGHT}× Bluesky backlinks, and an article must
 * clear the {@link MIN_ARTICLE_RECOMMENDERS} distinct-liker floor to chart.
 *
 * Counts are computed live because `documents.trending_score`,
 * `distinct_recommender_count`, and `backlink_count` are only maintained for the
 * 4-day discover slice and are stale for days 5–7 (see `recompute.ts`). Backlinks
 * have no per-event timestamp so they're added undecayed off `backlink_count`,
 * which itself under-counts days 5–7 — a small, accepted asymmetry (likes are the
 * primary, fully-accurate signal).
 */
export async function weekInReviewArticles(
  db: Db,
  schema: Schema,
  {
    sinceDays,
    limit,
    excludeUris = [],
    excludeReadForDid,
  }: {
    sinceDays: number;
    limit: number;
    /** Articles already shown elsewhere (the digest's best-of picks). */
    excludeUris?: Array<string>;
    /** Omit documents this reader has already read (weekly digest). */
    excludeReadForDid?: string;
  },
): Promise<Array<ArticleCard>> {
  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const pa = alias(schema.profiles, "pa");

  // Decay-weighted sum of the article's distinct-ish likes over the window. Each
  // like is weighted by its own age at WEEK_HALF_LIFE_HOURS; mirrors the `rec`
  // CTE in recompute.ts but with the gentler week half-life.
  const likeAgeHours =
    "extract(epoch from (now() - coalesce(r.created_at, r.indexed_at))) / 3600.0";
  const windowPredicate = sql`
      r.document_uri = ${d.uri}
      and r.deleted = false
      and r.recommender_did <> ${d.did}
      and coalesce(r.created_at, r.indexed_at) > now() - (${sinceDays}::text || ' days')::interval`;

  const decayedLikes = sql`coalesce((
    select sum(${sql.raw(halfLifeDecaySql(likeAgeHours, WEEK_HALF_LIFE_HOURS))})
    from recommends r
    where ${windowPredicate}
  ), 0)`;
  const distinctLikers = sql`(
    select count(distinct r.recommender_did)::int
    from recommends r
    where ${windowPredicate}
  )`;
  const weekScore = sql`${decayedLikes} + ${WEEK_BACKLINK_WEIGHT}::float8 * coalesce(${d.backlinkCount}, 0)`;

  const conds = [
    eq(d.deleted, false),
    discoverEligibleArticleWhere(p),
    documentPublishedNotInFuture(d),
    sql`${d.publishedAt} > now() - (${sinceDays}::text || ' days')::interval`,
    sql`${distinctLikers} >= ${MIN_ARTICLE_RECOMMENDERS}`,
  ];
  if (excludeUris.length > 0) {
    conds.push(notInArray(d.uri, excludeUris));
  }
  if (excludeReadForDid) {
    conds.push(documentUnreadWhere(schema, excludeReadForDid));
  }

  const rows = await db
    .select({
      ...trendingArticleSelection(schema),
      weekScore: weekScore.mapWith(Number),
      distinctLikers: distinctLikers.mapWith(Number),
    })
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(pr, eq(pr.did, p.did))
    .leftJoin(pa, eq(pa.did, d.did))
    .where(and(...conds))
    .orderBy(desc(weekScore), desc(distinctLikers), desc(d.publishedAt))
    .limit(trendingFetchPoolSize(limit));

  const cards = rows.map((row) => toArticleCard(row));
  return applyTrendingDiversityCaps(cards, limit).slice(0, limit);
}

/** Count of discover-eligible articles in the trending candidate set. */
export async function countTrendingDocuments(
  db: Db,
  schema: Schema,
  scope: TrendingArticlesScope = "rail",
): Promise<number> {
  const d = schema.documents;
  const p = schema.publications;

  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .where(and(...trendingArticleWhere(schema, scope)));
  return row?.count ?? 0;
}

/**
 * Trending publications ranked by the precomputed `publication_stats`
 * (`trending_score` = normalized decay/velocity blend with Constellation
 * backlink aggregate, recomputed on a schedule by `recomputeDerived()`).
 * Requires at least one indexed article and one subscriber so empty shells
 * never surface.
 */
export async function trendingPublications(
  db: Db,
  _schema: Schema,
  limit: number,
): Promise<Array<PublicationCard>> {
  const rows = await selectTrendingPublicationRows(db, limit);
  return rows.map((row) => toPublicationCard(row));
}

/** URIs of the current trending set — used to dedupe other Discover rails. */
export async function trendingPublicationUris(
  db: Db,
  _schema: Schema,
  limit: number,
): Promise<Array<string>> {
  const rows = await selectTrendingPublicationRows(db, limit);
  return rows.map((row) => row.uri);
}

type TrendingPublicationRow = Parameters<typeof toPublicationCard>[0];

async function selectTrendingPublicationRows(
  db: Db,
  limit: number,
): Promise<Array<TrendingPublicationRow>> {
  const result = await db.execute(sql`
    SELECT
      p.uri,
      p.did,
      p.name,
      p.url,
      p.description,
      p.icon_cid AS "iconCid",
      pr.avatar_url AS "ownerAvatarUrl",
      pr.handle AS "ownerHandle",
      p.topic,
      p.verified,
      coalesce(st.subscriber_count, 0)::int AS "subscriberCount",
      coalesce(st.document_count, 0)::int AS "documentCount",
      st.last_document_at AS "lastDocumentAt"
    FROM publications p
    LEFT JOIN profiles pr ON pr.did = p.did
    JOIN publication_stats st ON st.publication_uri = p.uri
    WHERE p.show_in_discover = true
      AND p.deleted = false
      AND p.url NOT ILIKE ${EXCLUDED_PUBLICATION_URL_PATTERN}
      AND coalesce(st.document_count, 0) > 0
      AND coalesce(st.subscriber_count, 0) > 0
    ORDER BY
      coalesce(st.trending_score, 0) DESC,
      coalesce(st.subscriber_count, 0) DESC,
      coalesce(st.document_count, 0) DESC,
      p.name ASC
    LIMIT ${limit}
  `);

  return result.rows as Array<TrendingPublicationRow>;
}

export type DiscoverDirectorySort = "readers" | "active" | "az";

export interface DiscoverTopicChip {
  topic: string;
  count: number;
}

/** Primary topic for a publication: indexed `topic`, else top document tag. */
function publicationEffectiveTopicSql(
  p: Schema["publications"],
): ReturnType<typeof sql<string | null>> {
  return sql<string | null>`coalesce(
    ${p.topic},
    (
      SELECT lower(btrim(tag))
      FROM documents d, unnest(d.tags) AS tag
      WHERE d.publication_uri = ${p.uri}
        AND d.deleted = false
        AND btrim(tag) <> ''
      GROUP BY lower(btrim(tag))
      ORDER BY count(*) DESC, lower(btrim(tag)) ASC
      LIMIT 1
    )
  )`;
}

/** Match a tag against a publication's effective topic or any indexed document tag. */
function publicationTagMatchSql(
  p: Schema["publications"],
  effectiveTopic: ReturnType<typeof publicationEffectiveTopicSql>,
  tag: string,
): ReturnType<typeof sql<boolean>> {
  return sql<boolean>`(
    lower(btrim(${effectiveTopic})) = lower(btrim(${tag}))
    OR exists (
      select 1
      from documents doc, unnest(doc.tags) as doc_tag
      where doc.publication_uri = ${p.uri}
        and doc.deleted = false
        and btrim(doc_tag) <> ''
        and lower(btrim(doc_tag)) = lower(btrim(${tag}))
    )
  )`;
}

/**
 * Total publications the network knows about: every non-deleted publication
 * that isn't an excluded platform profile (blento.app). Deliberately ignores
 * `show_in_discover` and topic/document gating — this is the headline "Known
 * publications" tally, a simple count of real publications.
 */
export async function countKnownPublications(db: Db): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS count
    FROM publications
    WHERE deleted = false
      AND url NOT ILIKE ${EXCLUDED_PUBLICATION_URL_PATTERN}
  `);
  const row = result.rows[0] as { count?: number } | undefined;
  return row?.count ?? 0;
}

/** Topic chips for Discover — derived live when `publications.topic` is unset. */
export async function discoverPublicationTopics(
  db: Db,
  limit: number,
): Promise<Array<DiscoverTopicChip>> {
  const result = await db.execute(sql`
    WITH pub_effective AS (
      SELECT p.uri,
             coalesce(
               p.topic,
               (
                 SELECT lower(btrim(tag))
                 FROM documents d, unnest(d.tags) AS tag
                 WHERE d.publication_uri = p.uri
                   AND d.deleted = false
                   AND btrim(tag) <> ''
                 GROUP BY lower(btrim(tag))
                 ORDER BY count(*) DESC, lower(btrim(tag)) ASC
                 LIMIT 1
               )
             ) AS topic
      FROM publications p
      WHERE p.show_in_discover = true
        AND p.deleted = false
        AND p.url NOT ILIKE ${EXCLUDED_PUBLICATION_URL_PATTERN}
    )
    SELECT topic, count(*)::int AS count
    FROM pub_effective
    WHERE topic IS NOT NULL
    GROUP BY topic
    ORDER BY count(*) DESC, topic ASC
    LIMIT ${limit}
  `);

  return result.rows as unknown as Array<DiscoverTopicChip>;
}

/**
 * Discover "All publications" directory — topic filter + pagination, sorted by
 * the precomputed `publication_stats` aggregates: subscriber/recommend totals
 * (Readers), latest indexed article (Active), or display name (A–Z). The stats
 * are refreshed on a schedule by `recomputeDerived()`.
 */
export type DiscoverDirectoryTopicMatch = "effective" | "document";

export async function discoverDirectoryPublications(
  db: Db,
  schema: Schema,
  {
    topic = null,
    topicMatch = "effective",
    sort,
    limit,
    offset,
    query = null,
  }: {
    topic?: string | null;
    /** `effective` = publication topic only; `document` = topic or any document tag. */
    topicMatch?: DiscoverDirectoryTopicMatch;
    sort: DiscoverDirectorySort;
    limit: number;
    offset: number;
    query?: string | null;
  },
): Promise<Array<PublicationCard>> {
  const p = schema.publications;
  const pr = schema.profiles;
  const st = schema.publicationStats;

  const effectiveTopic = publicationEffectiveTopicSql(p);

  const conds = [discoverEligiblePublicationWhere(p)];
  if (topic) {
    conds.push(
      topicMatch === "document"
        ? publicationTagMatchSql(p, effectiveTopic, topic)
        : sql`lower(btrim(${effectiveTopic})) = lower(btrim(${topic}))`,
    );
  }

  const trimmedQuery = query?.trim() ?? "";
  const tsq = trimmedQuery
    ? sql`websearch_to_tsquery('english', ${trimmedQuery})`
    : null;
  const likePattern = trimmedQuery ? `%${trimmedQuery}%` : null;

  if (trimmedQuery && tsq && likePattern) {
    const searchMatch = or(
      sql`${p.searchVector} @@ ${tsq}`,
      ilike(p.url, likePattern),
      ilike(pr.handle, likePattern),
      sql`lower(btrim(coalesce(${effectiveTopic}, ''))) like lower(${likePattern})`,
    );
    if (searchMatch) conds.push(searchMatch);
  }

  const sortName = publicationSortNameSql(p.name, p.url);

  const sortTieBreak =
    sort === "az"
      ? [asc(sortName), asc(p.uri)]
      : sort === "active"
        ? [sql`${st.lastDocumentAt} desc nulls last`, asc(sortName), asc(p.uri)]
        : [
            sql`(coalesce(${st.subscriberCount}, 0) * 2.0 + coalesce(${st.recommendCount}, 0) * 1.0) desc`,
            asc(sortName),
            asc(p.uri),
          ];

  const orderBy =
    trimmedQuery && tsq && likePattern
      ? [
          desc(sql`greatest(
            case when ${p.searchVector} @@ ${tsq}
              then ts_rank(${p.searchVector}, ${tsq})::real
              else 0::real
            end,
            case when ${p.url} ilike ${likePattern} then 0.12::real else 0::real end,
            case when ${pr.handle} ilike ${likePattern} then 0.1::real else 0::real end,
            case when lower(btrim(coalesce(${effectiveTopic}, ''))) like lower(${likePattern}) then 0.05::real else 0::real end
          )`),
          ...sortTieBreak,
        ]
      : sortTieBreak;

  const rows = await db
    .select({
      uri: p.uri,
      did: p.did,
      name: p.name,
      url: p.url,
      description: p.description,
      iconCid: p.iconCid,
      ownerAvatarUrl: pr.avatarUrl,
      ownerHandle: pr.handle,
      topic: effectiveTopic,
      verified: p.verified,
      subscriberCount: sql<number>`coalesce(${st.subscriberCount}, 0)`.mapWith(
        Number,
      ),
      documentCount: sql<number>`coalesce(${st.documentCount}, 0)`.mapWith(
        Number,
      ),
      lastDocumentAt: st.lastDocumentAt,
    })
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(...conds))
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  return rows.map((row) => toPublicationCard(row));
}

/** Document `tags` array includes `tag` (case-insensitive). */
/**
 * Normalized form of a tag as stored in the `documents_tags_norm_idx` GIN index
 * (lowercased, trimmed). Callers compare against
 * `immutable_normalized_tags(tags)` so the index can serve the predicate.
 */
function normalizedTagSql(tag: string): SQL {
  return sql`lower(btrim(${tag}))`;
}

/**
 * Document carries `tag` (case/whitespace-insensitive).
 *
 * Expressed as array containment against `immutable_normalized_tags(tags)` so
 * the GIN index answers it directly. The equivalent `exists (... unnest(tags)
 * ...)` form is not indexable and forced a full seq scan of `documents` — a tag
 * page cost seconds even when the tag matched nothing (see migration 0014).
 */
function documentCarriesTagWhere(d: Schema["documents"], tag: string): SQL {
  return sql`immutable_normalized_tags(${d.tags}) @> array[${normalizedTagSql(tag)}]`;
}

/**
 * Newest-first document ordering, spelled to match the `published_at DESC NULLS
 * LAST` indexes (`documents_published_idx`,
 * `documents_publication_published_idx`).
 *
 * Drizzle's `desc()` emits a bare `DESC`, which Postgres reads as NULLS FIRST —
 * and it will not match a NULLS LAST index even though `published_at` is
 * `NOT NULL`, so the ordering is semantically identical. That mismatch cost a
 * full scan: `/latest?filter=all` planned a parallel Seq Scan over ~345k
 * documents plus a top-N heapsort (726ms) where the index gives an ordered scan
 * that stops after ~37 rows (0.3ms).
 */
function documentsNewestFirst(d: Schema["documents"]): Array<SQL> {
  return [sql`${d.publishedAt} desc nulls last`, desc(d.uri)];
}

/** Count indexed, published articles carrying a tag on discover-eligible pubs. */
export async function countTagArticles(
  db: Db,
  schema: Schema,
  tag: string,
): Promise<number> {
  const d = schema.documents;
  const p = schema.publications;

  const row = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .where(
      and(
        eq(d.deleted, false),
        documentPublishedNotInFuture(d),
        discoverEligibleArticleWhere(p),
        documentCarriesTagWhere(d, tag),
      ),
    );

  return row[0]?.count ?? 0;
}

/** Publication has at least one indexed, published document carrying `tag`. */
function publicationHasTaggedDocumentSql(
  p: Schema["publications"],
  d: Schema["documents"],
  tag: string,
): SQL {
  return sql`exists (
    select 1
    from ${d} doc
    where doc.publication_uri = ${p.uri}
      and doc.deleted = false
      and doc.published_at <= now()
      and immutable_normalized_tags(doc.tags) @> array[${normalizedTagSql(tag)}]
  )`;
}

/** Indexed, published documents on a publication that carry a given tag. */
function publicationTaggedPostCountSql(
  p: Schema["publications"],
  d: Schema["documents"],
  tag: string,
): ReturnType<typeof sql<number>> {
  return sql<number>`coalesce((
    select count(*)::int
    from ${d} doc
    where doc.publication_uri = ${p.uri}
      and doc.deleted = false
      and doc.published_at <= now()
      and immutable_normalized_tags(doc.tags) @> array[${normalizedTagSql(tag)}]
  ), 0)`;
}

export interface TagPublicationCard extends PublicationCard {
  /** Posts on this publication indexed with the directory tag. */
  taggedPostCount: number;
}

export type TagDirectorySort = DiscoverDirectorySort | "tagged";

/**
 * Tag directory — discover-eligible publications with at least one indexed,
 * published document carrying the tag, plus per-publication tagged-post counts.
 */
export async function tagDirectoryPublications(
  db: Db,
  schema: Schema,
  {
    tag,
    sort,
    limit,
    offset,
  }: {
    tag: string;
    sort: TagDirectorySort;
    limit: number;
    offset: number;
  },
): Promise<Array<TagPublicationCard>> {
  const p = schema.publications;
  const pr = schema.profiles;
  const st = schema.publicationStats;
  const d = schema.documents;

  const effectiveTopic = publicationEffectiveTopicSql(p);
  const taggedPostCount = publicationTaggedPostCountSql(p, d, tag);

  const conds = [
    discoverEligiblePublicationWhere(p),
    publicationHasTaggedDocumentSql(p, d, tag),
  ];

  const sortName = publicationSortNameSql(p.name, p.url);

  const sortTieBreak =
    sort === "tagged"
      ? [desc(taggedPostCount), asc(sortName), asc(p.uri)]
      : sort === "az"
        ? [asc(sortName), asc(p.uri)]
        : sort === "active"
          ? [
              sql`${st.lastDocumentAt} desc nulls last`,
              asc(sortName),
              asc(p.uri),
            ]
          : [
              sql`(coalesce(${st.subscriberCount}, 0) * 2.0 + coalesce(${st.recommendCount}, 0) * 1.0) desc`,
              asc(sortName),
              asc(p.uri),
            ];

  const rows = await db
    .select({
      uri: p.uri,
      did: p.did,
      name: p.name,
      url: p.url,
      description: p.description,
      iconCid: p.iconCid,
      ownerAvatarUrl: pr.avatarUrl,
      ownerHandle: pr.handle,
      topic: effectiveTopic,
      verified: p.verified,
      subscriberCount: sql<number>`coalesce(${st.subscriberCount}, 0)`.mapWith(
        Number,
      ),
      documentCount: sql<number>`coalesce(${st.documentCount}, 0)`.mapWith(
        Number,
      ),
      lastDocumentAt: st.lastDocumentAt,
      taggedPostCount: taggedPostCount.mapWith(Number),
    })
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(...conds))
    .orderBy(...sortTieBreak)
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    ...toPublicationCard(row),
    taggedPostCount: row.taggedPostCount,
  }));
}

/** Count discover-eligible publications with indexed posts carrying `tag`. */
export async function countTagPublications(
  db: Db,
  schema: Schema,
  tag: string,
): Promise<number> {
  const p = schema.publications;
  const d = schema.documents;

  const row = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(p)
    .where(
      and(
        discoverEligiblePublicationWhere(p),
        publicationHasTaggedDocumentSql(p, d, tag),
      ),
    );

  return row[0]?.count ?? 0;
}

/** Every discover-eligible publication URI with indexed posts carrying `tag`. */
export async function selectTagPublicationUris(
  db: Db,
  schema: Schema,
  tag: string,
): Promise<Array<string>> {
  const p = schema.publications;
  const d = schema.documents;

  const rows = await db
    .select({ uri: p.uri })
    .from(p)
    .where(
      and(
        discoverEligiblePublicationWhere(p),
        publicationHasTaggedDocumentSql(p, d, tag),
      ),
    )
    .orderBy(asc(p.uri));

  return rows.map((row) => row.uri);
}

export interface PublicationRailOpts {
  /** Publication URIs to omit (e.g. the current trending set). */
  excludeUris?: Array<string>;
  /**
   * Follow set to anchor on / exclude from suggestions. Pass the reader's
   * *effective* follows (subscriptions + saved-list publications) so list
   * members aren't re-suggested; defaults to raw subscriptions.
   */
  followUris?: Array<string>;
  /**
   * Rotation seed (see {@link rotationSeed}). Pass a surface-specific seed so
   * home / discover / digest rails draw different slices of the candidate
   * pool; defaults to a per-viewer daily seed.
   */
  seed?: string;
}

function mergeExcludeUris(...groups: Array<Array<string>>): Array<string> {
  return [...new Set(groups.flat())];
}

type ScoredUri = { uri: string; score: number };

function mergeScoredUris(
  groups: Array<{ weight: number; scores: Array<ScoredUri> }>,
): Array<ScoredUri> {
  const merged = new Map<string, number>();
  for (const { weight, scores } of groups) {
    for (const { uri, score } of scores) {
      merged.set(uri, (merged.get(uri) ?? 0) + score * weight);
    }
  }
  return [...merged.entries()]
    .map(([uri, score]) => ({ uri, score }))
    .toSorted((a, b) => b.score - a.score);
}

/** Fetch {@link PublicationCard}s for `uris`, preserving rank order. */
async function publicationCardsByOrderedUris(
  db: Db,
  schema: Schema,
  uris: Array<string>,
): Promise<Array<PublicationCard>> {
  if (uris.length === 0) {
    return [];
  }

  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;
  const rows = await db
    .select(publicationCardColumns(schema))
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(
      and(
        inArray(p.uri, uris),
        eq(p.deleted, false),
        discoverEligiblePublicationWhere(p),
        hasIndexedDocuments(db, schema, p.uri),
      ),
    );

  const byUri = new Map(rows.map((row) => [row.uri, toPublicationCard(row)]));
  return uris
    .map((uri) => byUri.get(uri))
    .filter((pub): pub is PublicationCard => pub != null);
}

async function cosubScoresForAnchors(
  db: Db,
  schema: Schema,
  anchorUris: Array<string>,
  excludeUris: Array<string>,
): Promise<Array<ScoredUri>> {
  if (anchorUris.length === 0) {
    return [];
  }

  const cs = schema.publicationCosubscriptions;
  const conds = [inArray(cs.publicationUri, anchorUris)];
  if (excludeUris.length > 0) {
    conds.push(notInArray(cs.relatedPublicationUri, excludeUris));
  }

  const rows = await db
    .select({
      uri: cs.relatedPublicationUri,
      score: sql<number>`sum(${cs.score})`.mapWith(Number),
    })
    .from(cs)
    .where(and(...conds))
    .groupBy(cs.relatedPublicationUri);

  return rows.map((row) => ({ uri: row.uri, score: row.score }));
}

async function corecommendScoresForAnchors(
  db: Db,
  schema: Schema,
  anchorUris: Array<string>,
  excludeUris: Array<string>,
): Promise<Array<ScoredUri>> {
  if (anchorUris.length === 0) {
    return [];
  }

  const cc = schema.publicationCorecommends;
  const conds = [inArray(cc.publicationUri, anchorUris)];
  if (excludeUris.length > 0) {
    conds.push(notInArray(cc.relatedPublicationUri, excludeUris));
  }

  const rows = await db
    .select({
      uri: cc.relatedPublicationUri,
      score: sql<number>`sum(${cc.score})`.mapWith(Number),
    })
    .from(cc)
    .where(and(...conds))
    .groupBy(cc.relatedPublicationUri);

  return rows.map((row) => ({ uri: row.uri, score: row.score }));
}

/**
 * Publications liked by readers who also follow the anchor set (personalized
 * social signal). Scores are normalized by each publication's total recommend
 * base (`count / sqrt(total)`) so already-huge publications don't drown out
 * niche ones that are disproportionately liked by the reader's cohort.
 */
async function coReaderLikeScores(
  db: Db,
  schema: Schema,
  anchorUris: Array<string>,
  readerDid: string,
  excludeUris: Array<string>,
): Promise<Array<ScoredUri>> {
  if (anchorUris.length === 0) {
    return [];
  }

  const sub = schema.subscriptions;
  const rc = schema.recommends;
  const doc = schema.documents;
  const st = schema.publicationStats;

  const coReaders = db
    .selectDistinct({ did: sub.subscriberDid })
    .from(sub)
    .where(
      and(
        inArray(sub.publicationUri, anchorUris),
        ne(sub.subscriberDid, readerDid),
        eq(sub.deleted, false),
      ),
    )
    .as("co_readers");

  const recConds = [eq(rc.deleted, false), eq(doc.deleted, false)];
  if (excludeUris.length > 0) {
    recConds.push(notInArray(doc.publicationUri, excludeUris));
  }

  const rows = await db
    .select({
      uri: doc.publicationUri,
      score: sql<number>`count(distinct ${rc.recommenderDid})::float8
        / sqrt(greatest(max(coalesce(${st.recommendCount}, 0)), 1)::float8)`.mapWith(
        Number,
      ),
    })
    .from(rc)
    .innerJoin(doc, eq(doc.uri, rc.documentUri))
    .innerJoin(coReaders, eq(coReaders.did, rc.recommenderDid))
    .leftJoin(st, eq(st.publicationUri, doc.publicationUri))
    .where(and(...recConds, isNotNull(doc.publicationUri)))
    .groupBy(doc.publicationUri);

  return rows
    .filter((row): row is { uri: string; score: number } => row.uri != null)
    .map((row) => ({ uri: row.uri, score: row.score }));
}

/** Publications with at least one indexed, non-deleted document. */
function hasIndexedDocuments(
  db: Db,
  schema: Schema,
  publicationUri: typeof schema.publications.uri,
) {
  const doc = schema.documents;
  return exists(
    db
      .select({ one: sql`1` })
      .from(doc)
      .where(
        and(eq(doc.publicationUri, publicationUri), eq(doc.deleted, false)),
      ),
  );
}

async function backfillPublicationRail(
  db: Db,
  schema: Schema,
  primary: Array<PublicationCard>,
  limit: number,
  excludeUris: Array<string>,
  seed?: string,
): Promise<Array<PublicationCard>> {
  if (primary.length >= limit) {
    return primary.slice(0, limit);
  }

  const seen = mergeExcludeUris(
    excludeUris,
    primary.map((pub) => pub.uri),
  );
  const backfill = await popularPublications(
    db,
    schema,
    limit - primary.length,
    seen,
    seed,
  );
  return [...primary, ...backfill].slice(0, limit);
}

/**
 * Most-subscribed discover-eligible publications (cold-start "popular"), with an
 * optional exclusion set (e.g. publications the reader already follows).
 *
 * When `seed` is provided, a wider candidate pool is fetched and rank-weighted
 * sampling ({@link rotateRail}) draws the final `limit`, so the rail rotates
 * daily/per-surface instead of showing the identical top-N to everyone.
 */
export async function popularPublications(
  db: Db,
  schema: Schema,
  limit: number,
  excludeUris: Array<string> = [],
  seed?: string,
): Promise<Array<PublicationCard>> {
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;

  const conds = [
    discoverEligiblePublicationWhere(p),
    hasIndexedDocuments(db, schema, p.uri),
  ];
  if (excludeUris.length > 0) {
    conds.push(notInArray(p.uri, excludeUris));
  }

  const poolSize = seed ? limit * ROTATION_POOL_MULTIPLIER : limit;
  const rows = await db
    .select(publicationCardColumns(schema))
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(...conds))
    .orderBy(
      desc(sql`coalesce(${st.trendingScore}, 0)`),
      desc(sql`coalesce(${st.recommendCount}, 0)`),
      desc(sql`coalesce(${st.subscriberCount}, 0)`),
    )
    .limit(poolSize);
  const cards = rows.map((row) => toPublicationCard(row));
  return seed ? rotateRail(cards, limit, seed) : cards;
}

/**
 * "Recommended for you" — blends co-subscription similarity, co-recommend
 * affinity, and live likes from readers who follow the same publications.
 * Cold-start readers fall back to {@link popularPublications}.
 */
export async function recommendedPublications(
  db: Db,
  schema: Schema,
  did: string,
  limit: number,
  opts: PublicationRailOpts = {},
): Promise<Array<PublicationCard>> {
  const excludeUris = opts.excludeUris ?? [];
  const seed = opts.seed ?? rotationSeed("recommended", did);
  const followUris =
    opts.followUris ?? (await selectFollowUris(db, schema, did));
  if (followUris.length === 0) {
    return popularPublications(db, schema, limit, excludeUris, seed);
  }

  const mergedExclude = mergeExcludeUris(excludeUris, followUris);
  const [cosub, corecommend, coReaderLikes] = await Promise.all([
    cosubScoresForAnchors(db, schema, followUris, mergedExclude),
    corecommendScoresForAnchors(db, schema, followUris, mergedExclude),
    coReaderLikeScores(db, schema, followUris, did, mergedExclude),
  ]);

  const ranked = mergeScoredUris([
    { weight: RECOMMENDATION_BLEND.cosub, scores: cosub },
    { weight: RECOMMENDATION_BLEND.corecommend, scores: corecommend },
    { weight: RECOMMENDATION_BLEND.coReaderLike, scores: coReaderLikes },
  ]);

  // Fetch a wider pool than needed, then rotate: rank-weighted sampling keeps
  // the strongest matches likely while letting the long tail surface across
  // days/surfaces, so the rail stops showing the same handful every time.
  const pool = await publicationCardsByOrderedUris(
    db,
    schema,
    ranked.slice(0, limit * ROTATION_POOL_MULTIPLIER).map((row) => row.uri),
  );
  const primary = rotateRail(pool, limit, seed);

  return backfillPublicationRail(
    db,
    schema,
    primary,
    limit,
    mergedExclude,
    seed,
  );
}

/**
 * "Followed by people you follow" — publications co-subscribed or liked by
 * readers who also follow the ones you already follow.
 */
export async function followedByPeopleYouFollow(
  db: Db,
  schema: Schema,
  did: string,
  limit: number,
  opts: PublicationRailOpts = {},
): Promise<Array<PublicationCard>> {
  const excludeUris = opts.excludeUris ?? [];
  const seed = opts.seed ?? rotationSeed("followed-by", did);
  const followUris =
    opts.followUris ?? (await selectFollowUris(db, schema, did));
  if (followUris.length === 0) {
    return [];
  }

  const sub = schema.subscriptions;
  const mergedExclude = mergeExcludeUris(excludeUris, followUris);

  const coReaders = db
    .selectDistinct({ did: sub.subscriberDid })
    .from(sub)
    .where(
      and(
        inArray(sub.publicationUri, followUris),
        ne(sub.subscriberDid, did),
        eq(sub.deleted, false),
      ),
    )
    .as("co_readers");

  const subConds = [
    notInArray(sub.publicationUri, followUris),
    eq(sub.deleted, false),
  ];
  if (excludeUris.length > 0) {
    subConds.push(notInArray(sub.publicationUri, excludeUris));
  }

  const [followScores, likeScores] = await Promise.all([
    db
      .select({
        uri: sub.publicationUri,
        score: sql<number>`count(distinct ${sub.subscriberDid})`.mapWith(
          Number,
        ),
      })
      .from(sub)
      .innerJoin(coReaders, eq(coReaders.did, sub.subscriberDid))
      .where(and(...subConds))
      .groupBy(sub.publicationUri),
    coReaderLikeScores(db, schema, followUris, did, mergedExclude),
  ]);

  const ranked = mergeScoredUris([
    { weight: RECOMMENDATION_BLEND.coReaderFollow, scores: followScores },
    { weight: RECOMMENDATION_BLEND.coReaderLike, scores: likeScores },
  ]);

  const pool = await publicationCardsByOrderedUris(
    db,
    schema,
    ranked.slice(0, limit * ROTATION_POOL_MULTIPLIER).map((row) => row.uri),
  );
  return rotateRail(pool, limit, seed);
}

/**
 * "Readers also follow" for a publication profile — blends co-subscription and
 * co-recommend similarity.
 */
export async function readersAlsoFollow(
  db: Db,
  schema: Schema,
  publicationUri: string,
  limit: number,
): Promise<Array<PublicationCard>> {
  const [cosub, corecommend] = await Promise.all([
    cosubScoresForAnchors(db, schema, [publicationUri], []),
    corecommendScoresForAnchors(db, schema, [publicationUri], []),
  ]);

  const ranked = mergeScoredUris([
    { weight: RECOMMENDATION_BLEND.cosub, scores: cosub },
    { weight: RECOMMENDATION_BLEND.corecommend, scores: corecommend },
  ]);

  return publicationCardsByOrderedUris(
    db,
    schema,
    ranked.slice(0, limit).map((row) => row.uri),
  );
}

/**
 * Publication recommendations for the article footer — co-subscribed readers
 * first, then personalized/popular fallbacks when the graph is sparse.
 */
export async function articleRecommendedPublications(
  db: Db,
  schema: Schema,
  opts: {
    publicationUri: string | null;
    readerDid?: string;
    limit: number;
  },
): Promise<Array<PublicationCard>> {
  const exclude = opts.publicationUri ? [opts.publicationUri] : [];

  if (opts.publicationUri) {
    const alsoFollow = await readersAlsoFollow(
      db,
      schema,
      opts.publicationUri,
      opts.limit,
    );
    if (alsoFollow.length > 0) {
      return alsoFollow
        .filter((pub) => !exclude.includes(pub.uri))
        .slice(0, opts.limit);
    }
  }

  if (opts.readerDid) {
    const personalized = await recommendedPublications(
      db,
      schema,
      opts.readerDid,
      opts.limit,
    );
    const filtered = personalized.filter((pub) => !exclude.includes(pub.uri));
    if (filtered.length > 0) {
      return filtered.slice(0, opts.limit);
    }
  }

  return popularPublications(db, schema, opts.limit, exclude);
}

export interface CoReaderSocialProofReader {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface CoReaderSocialProof {
  readers: Array<CoReaderSocialProofReader>;
  total: number;
}

/**
 * Publication-profile social proof — Bluesky accounts you follow who also
 * subscribe to or like this publication.
 */
export async function publicationFollowedByCoReaders(
  db: Db,
  schema: Schema,
  readerDid: string,
  publicationUri: string,
  limit: number,
  _opts: PublicationRailOpts = {},
): Promise<CoReaderSocialProof> {
  const { filterDidsFollowedByActor } =
    await import("#/server/atproto/bsky-relationships");

  const sub = schema.subscriptions;
  const pr = schema.profiles;
  const rc = schema.recommends;
  const doc = schema.documents;

  const [followRows, likeRows] = await Promise.all([
    db
      .selectDistinct({
        did: sub.subscriberDid,
        handle: pr.handle,
        displayName: pr.displayName,
        avatarUrl: pr.avatarUrl,
      })
      .from(sub)
      .leftJoin(pr, eq(pr.did, sub.subscriberDid))
      .where(
        and(
          eq(sub.publicationUri, publicationUri),
          eq(sub.deleted, false),
          ne(sub.subscriberDid, readerDid),
        ),
      ),
    db
      .selectDistinct({
        did: rc.recommenderDid,
        handle: pr.handle,
        displayName: pr.displayName,
        avatarUrl: pr.avatarUrl,
      })
      .from(rc)
      .innerJoin(doc, eq(doc.uri, rc.documentUri))
      .leftJoin(pr, eq(pr.did, rc.recommenderDid))
      .where(
        and(
          eq(doc.publicationUri, publicationUri),
          eq(rc.deleted, false),
          eq(doc.deleted, false),
          ne(rc.recommenderDid, readerDid),
        ),
      ),
  ]);

  const candidateDids = [
    ...new Set([
      ...followRows.map((row) => row.did),
      ...likeRows.map((row) => row.did),
    ]),
  ];
  const followedDids = await filterDidsFollowedByActor(
    readerDid,
    candidateDids,
  );
  if (followedDids.size === 0) {
    return { readers: [], total: 0 };
  }

  const filteredFollowRows = followRows.filter((row) =>
    followedDids.has(row.did),
  );
  const filteredLikeRows = likeRows.filter((row) => followedDids.has(row.did));

  const ranked = new Map<
    string,
    CoReaderSocialProofReader & { score: number }
  >();

  for (const row of filteredFollowRows) {
    ranked.set(row.did, {
      did: row.did,
      handle: row.handle,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      score: RECOMMENDATION_BLEND.coReaderFollow,
    });
  }

  for (const row of filteredLikeRows) {
    const existing = ranked.get(row.did);
    if (existing) {
      existing.score += RECOMMENDATION_BLEND.coReaderLike;
      existing.handle ??= row.handle;
      existing.displayName ??= row.displayName;
      existing.avatarUrl ??= row.avatarUrl;
    } else {
      ranked.set(row.did, {
        did: row.did,
        handle: row.handle,
        displayName: row.displayName,
        avatarUrl: row.avatarUrl,
        score: RECOMMENDATION_BLEND.coReaderLike,
      });
    }
  }

  const sorted = [...ranked.values()].toSorted((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aLabel = a.handle ?? a.displayName ?? a.did;
    const bLabel = b.handle ?? b.displayName ?? b.did;
    return aLabel.localeCompare(bLabel);
  });

  return {
    readers: sorted
      .slice(0, limit)
      .map(({ did, handle, displayName, avatarUrl }) => ({
        did,
        handle,
        displayName,
        avatarUrl,
      })),
    total: sorted.length,
  };
}

/** Blend weights for cross-publication related-article ranking. */
const RELATED_ARTICLE_BLEND = {
  coRead: 2,
  tagOverlap: 1,
} as const;

/** Fetch {@link ArticleCard}s for `uris`, preserving rank order. */
export async function selectArticleCardsByUris(
  db: Db,
  schema: Schema,
  uris: Array<string>,
  /**
   * When `lite`, omit the document body (`textContent`) from the projection.
   * Callers that only need card metadata (collection editor + newsletter
   * compose) avoid pulling full essay bodies into the payload + SSR dehydration.
   * Reading-time labels go blank for these rows, which those surfaces don't show.
   */
  opts?: {
    lite?: boolean;
    readForDid?: string;
    countOldPostsAsUnread?: boolean;
  },
): Promise<Array<ArticleCard>> {
  if (uris.length === 0) {
    return [];
  }

  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const pa = alias(schema.profiles, "pa");
  const baseColumns = opts?.lite
    ? articleQueueCardColumns(schema)
    : articleCardColumns(schema);
  const selection = opts?.readForDid
    ? {
        ...baseColumns,
        isRead: documentReadExistsColumn(schema, opts.readForDid, {
          countOldPostsAsUnread: opts.countOldPostsAsUnread,
        }),
      }
    : baseColumns;
  const rows = await db
    .select(selection)
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(pr, eq(pr.did, p.did))
    .leftJoin(pa, eq(pa.did, d.did))
    .where(
      and(
        inArray(d.uri, uris),
        eq(d.deleted, false),
        documentPublishedNotInFuture(d),
      ),
    );

  const byUri = new Map(rows.map((row) => [row.uri, toArticleCard(row)]));
  return uris
    .map((uri) => byUri.get(uri))
    .filter((doc): doc is ArticleCard => doc != null);
}

async function coReadScoresForDocument(
  db: Db,
  documentUri: string,
  publicationUri: string | null,
): Promise<Array<ScoredUri>> {
  const samePubFilter = publicationUri
    ? sql`AND d.publication_uri IS DISTINCT FROM ${publicationUri}`
    : sql``;

  const result = await db.execute(sql`
    SELECT r2.document_uri AS uri,
           count(*)::float AS score
    FROM reads r1
    INNER JOIN reads r2 ON r1.owner_did = r2.owner_did
    INNER JOIN documents d ON d.uri = r2.document_uri
    WHERE r1.document_uri = ${documentUri}
      AND r2.document_uri != ${documentUri}
      AND d.deleted = false
      AND d.published_at <= now()
      ${samePubFilter}
    GROUP BY r2.document_uri
    ORDER BY count(*) DESC
    LIMIT 30
  `);

  return result.rows as Array<ScoredUri>;
}

async function tagOverlapScoresForDocument(
  db: Db,
  documentUri: string,
  publicationUri: string | null,
): Promise<Array<ScoredUri>> {
  const samePubFilter = publicationUri
    ? sql`AND d.publication_uri IS DISTINCT FROM ${publicationUri}`
    : sql``;

  const result = await db.execute(sql`
    WITH anchor_tags AS (
      SELECT lower(btrim(tag)) AS tag
      FROM documents d, unnest(d.tags) AS tag
      WHERE d.uri = ${documentUri}
        AND btrim(tag) <> ''
    ),
    shared AS (
      SELECT d.uri,
             count(*)::float AS score
      FROM documents d,
           unnest(d.tags) AS doc_tag
      WHERE d.deleted = false
        AND d.uri != ${documentUri}
        AND d.published_at <= now()
        ${samePubFilter}
        AND lower(btrim(doc_tag)) IN (SELECT tag FROM anchor_tags)
      GROUP BY d.uri
    )
    SELECT uri, score
    FROM shared
    ORDER BY score DESC
    LIMIT 30
  `);

  return result.rows as Array<ScoredUri>;
}

/**
 * Cross-publication articles related by shared tags and co-read patterns —
 * complements same-publication "More from" rails.
 */
export async function relatedArticles(
  db: Db,
  schema: Schema,
  opts: {
    documentUri: string;
    publicationUri: string | null;
    limit: number;
  },
): Promise<Array<ArticleCard>> {
  const [coRead, tagOverlap] = await Promise.all([
    coReadScoresForDocument(db, opts.documentUri, opts.publicationUri),
    tagOverlapScoresForDocument(db, opts.documentUri, opts.publicationUri),
  ]);

  const ranked = mergeScoredUris([
    { weight: RELATED_ARTICLE_BLEND.coRead, scores: coRead },
    { weight: RELATED_ARTICLE_BLEND.tagOverlap, scores: tagOverlap },
  ]);

  if (ranked.length === 0) {
    return [];
  }

  const uris = ranked.slice(0, opts.limit).map((row) => row.uri);
  return selectArticleCardsByUris(db, schema, uris);
}

export interface AuthorProfileStats {
  publicationCount: number;
  documentCount: number;
  subscriberCount: number;
  subscriptionCount: number;
  recommendationCount: number;
}

/** @deprecated Use {@link AuthorProfileStats}. */
export type AuthorPublicationStats = AuthorProfileStats;

/**
 * Publications carrying at least one document this DID has a byline on — their
 * own repo records *plus* ones crediting them via
 * `site.standard.document#contributor[]` in someone else's repo.
 *
 * Gathers publications *from the author's documents* (two index-driven branches
 * unioned) rather than the natural phrasing — "for each publication, does a
 * matching document exist". That correlated `exists` makes Postgres seq-scan
 * `publications` and probe `documents` once per row (~6.5k index searches,
 * ~1.3s); this shape is sub-millisecond. `union` (not `union all`) because a
 * document can both live in the author's repo and credit them as a contributor.
 */
function bylinePublicationUris(schema: Schema, did: string): SQL {
  const d = schema.documents;
  const dc = schema.documentContributors;
  return sql`(
    select ${d.publicationUri} from ${d}
     where ${d.did} = ${did}
       and ${d.publicationUri} is not null
       and ${d.deleted} = false
       and ${documentPublishedNotInFuture(d)}
    union
    select ${d.publicationUri} from ${d}
      join ${dc} on ${dc.documentUri} = ${d.uri} and ${dc.did} = ${did}
     where ${d.publicationUri} is not null
       and ${d.deleted} = false
       and ${documentPublishedNotInFuture(d)}
  )`;
}

/**
 * Publications this DID is *featured in* rather than owns: someone else's
 * publication carrying at least one published post they wrote or are credited
 * on. Correlates against the `publications` relation in the outer query.
 */
function featuredInPublication(schema: Schema, did: string): SQL {
  const p = schema.publications;
  return sql`(${p.did} <> ${did} and ${p.uri} in ${bylinePublicationUris(schema, did)})`;
}

/**
 * Aggregate stats for an author profile header: publications plus
 * `site.standard.graph.subscription` / `recommend` activity.
 *
 * `publicationCount` and `documentCount` gate tab visibility and render as tab
 * badges, so both count exactly what their tab lists: publications the author
 * owns *or* is featured in, and documents they have a byline on (their own
 * repo plus contributor credits elsewhere). `subscriberCount` stays owned-only
 * — it measures the author's own reach.
 */
export async function authorProfileStats(
  db: Db,
  schema: Schema,
  did: string,
): Promise<AuthorProfileStats> {
  const p = schema.publications;
  const st = schema.publicationStats;
  const sub = schema.subscriptions;
  const rec = schema.recommends;
  const d = schema.documents;
  const dc = schema.documentContributors;

  const [pubRow, featuredPubRow, subRow, recRow, ownDocRow, creditDocRow] =
    await Promise.all([
      db
        .select({
          publicationCount: sql<number>`count(*)::int`.mapWith(Number),
          subscriberCount:
            sql<number>`coalesce(sum(${st.subscriberCount}), 0)::int`.mapWith(
              Number,
            ),
        })
        .from(p)
        .leftJoin(st, eq(st.publicationUri, p.uri))
        .where(
          and(
            eq(p.did, did),
            eq(p.deleted, false),
            sql`${p.url} not ilike ${EXCLUDED_PUBLICATION_URL_PATTERN}`,
          ),
        ),
      // Publications owned by someone else that carry this author's writing.
      // Unlike owned pubs, opted-out ones never count — the tab hides them.
      db
        .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
        .from(p)
        .where(
          and(
            eq(p.deleted, false),
            eq(p.showInDiscover, true),
            sql`${p.url} not ilike ${EXCLUDED_PUBLICATION_URL_PATTERN}`,
            featuredInPublication(schema, did),
          ),
        ),
      db
        .select({
          count:
            sql<number>`count(distinct ${sub.publicationUri})::int`.mapWith(
              Number,
            ),
        })
        .from(sub)
        .where(and(eq(sub.subscriberDid, did), eq(sub.deleted, false))),
      db
        .select({
          count: sql<number>`count(*)::int`.mapWith(Number),
        })
        .from(rec)
        .where(and(eq(rec.recommenderDid, did), eq(rec.deleted, false))),
      // Every document this author has a byline on, wherever it lives: their own
      // publications, someone else's, or "loose" (an `https://` `site` with no
      // matching publication row). Same two disjoint index-driven branches as
      // `authorDocuments`, so the counts simply add — see the note there for why
      // this isn't one `or`.
      db
        .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
        .from(d)
        .where(
          and(
            eq(d.did, did),
            eq(d.deleted, false),
            documentPublishedNotInFuture(d),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
        .from(dc)
        .innerJoin(d, eq(d.uri, dc.documentUri))
        .where(
          and(
            eq(dc.did, did),
            ne(d.did, did),
            eq(d.deleted, false),
            documentPublishedNotInFuture(d),
          ),
        ),
    ]);

  return {
    publicationCount:
      (pubRow[0]?.publicationCount ?? 0) + (featuredPubRow[0]?.count ?? 0),
    documentCount: (ownDocRow[0]?.count ?? 0) + (creditDocRow[0]?.count ?? 0),
    subscriberCount: pubRow[0]?.subscriberCount ?? 0,
    subscriptionCount: subRow[0]?.count ?? 0,
    recommendationCount: recRow[0]?.count ?? 0,
  };
}

/** @deprecated Use {@link authorProfileStats}. */
export const authorPublicationStats = authorProfileStats;

/** Hydrate publication cards for `uris`, preserving order (no discover filter). */
async function orderedPublicationCardsForUris(
  db: Db,
  schema: Schema,
  uris: Array<string>,
): Promise<Array<PublicationCard>> {
  if (uris.length === 0) {
    return [];
  }

  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;
  const rows = await db
    .select(publicationCardColumns(schema))
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(
      and(
        inArray(p.uri, uris),
        eq(p.deleted, false),
        sql`${p.url} not ilike ${EXCLUDED_PUBLICATION_URL_PATTERN}`,
      ),
    );

  const byUri = new Map(rows.map((row) => [row.uri, toPublicationCard(row)]));
  return uris
    .map((uri) => byUri.get(uri))
    .filter((pub): pub is PublicationCard => pub != null);
}

export interface AuthorActivityPage<T> {
  items: Array<T>;
  total: number;
}

export interface AuthorSubscriptionsQueryResult {
  items: Array<PublicationCard>;
  total: number;
  /**
   * Number of subscription rows consumed by this page (before hydration
   * drops any publication that's deleted/excluded) — use this, not
   * `items.length`, to decide whether another page exists. A publication
   * dropped during hydration would otherwise make `items.length < limit`
   * mid-list and prematurely look like the end of the list.
   */
  fetchedCount: number;
}

/**
 * Publications this DID subscribes to (`site.standard.graph.subscription`),
 * newest subscription first.
 */
export async function authorSubscriptions(
  db: Db,
  schema: Schema,
  opts: { did: string; limit: number; offset?: number },
): Promise<AuthorSubscriptionsQueryResult> {
  const sub = schema.subscriptions;
  const where = and(eq(sub.subscriberDid, opts.did), eq(sub.deleted, false));

  const [countRow, uriRows] = await Promise.all([
    db
      .select({
        count: sql<number>`count(distinct ${sub.publicationUri})::int`.mapWith(
          Number,
        ),
      })
      .from(sub)
      .where(where),
    db
      .select({
        publicationUri: sub.publicationUri,
      })
      .from(sub)
      .where(where)
      .groupBy(sub.publicationUri)
      .orderBy(desc(sql`max(${sub.createdAt})`), asc(sub.publicationUri))
      .limit(opts.limit)
      .offset(opts.offset ?? 0),
  ]);

  const uris = uriRows.map((row) => row.publicationUri);
  const items = await orderedPublicationCardsForUris(db, schema, uris);

  return {
    items,
    total: countRow[0]?.count ?? 0,
    fetchedCount: uris.length,
  };
}

export interface AuthorReader {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * Distinct readers subscribed to any of this DID's publications
 * (`site.standard.graph.subscription`), most recently subscribed first.
 */
export async function authorReaders(
  db: Db,
  schema: Schema,
  opts: { did: string; limit: number; offset?: number },
): Promise<AuthorActivityPage<AuthorReader>> {
  const p = schema.publications;
  const sub = schema.subscriptions;
  const pr = schema.profiles;

  const pubRows = await db
    .select({ uri: p.uri })
    .from(p)
    .where(and(eq(p.did, opts.did), eq(p.deleted, false)));
  const pubUris = pubRows.map((row) => row.uri);

  if (pubUris.length === 0) {
    return { items: [], total: 0 };
  }

  const where = and(
    inArray(sub.publicationUri, pubUris),
    eq(sub.deleted, false),
  );

  const [countRow, didRows] = await Promise.all([
    db
      .select({
        count: sql<number>`count(distinct ${sub.subscriberDid})::int`.mapWith(
          Number,
        ),
      })
      .from(sub)
      .where(where),
    db
      .select({ subscriberDid: sub.subscriberDid })
      .from(sub)
      .where(where)
      .groupBy(sub.subscriberDid)
      .orderBy(desc(sql`max(${sub.createdAt})`), asc(sub.subscriberDid))
      .limit(opts.limit)
      .offset(opts.offset ?? 0),
  ]);

  const dids = didRows.map((row) => row.subscriberDid);
  if (dids.length === 0) {
    return { items: [], total: countRow[0]?.count ?? 0 };
  }

  const profileRows = await db
    .select({
      did: pr.did,
      handle: pr.handle,
      displayName: pr.displayName,
      avatarUrl: pr.avatarUrl,
    })
    .from(pr)
    .where(inArray(pr.did, dids));
  const byDid = new Map(profileRows.map((row) => [row.did, row]));

  const items = dids.map(
    (did): AuthorReader =>
      byDid.get(did) ?? {
        did,
        handle: null,
        displayName: null,
        avatarUrl: null,
      },
  );

  return { items, total: countRow[0]?.count ?? 0 };
}

/**
 * Articles this DID has liked (`site.standard.graph.recommend`), newest first.
 */
export async function authorRecommendations(
  db: Db,
  schema: Schema,
  opts: { did: string; limit: number; offset?: number },
): Promise<AuthorActivityPage<ArticleCard>> {
  const rec = schema.recommends;
  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const pa = alias(schema.profiles, "pa");
  const where = and(eq(rec.recommenderDid, opts.did), eq(rec.deleted, false));

  const [countRow, rows] = await Promise.all([
    db
      .select({
        count: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(rec)
      .where(where),
    db
      .select(articleCardColumns(schema))
      .from(rec)
      .leftJoin(d, eq(d.uri, rec.documentUri))
      .leftJoin(p, eq(p.uri, d.publicationUri))
      .leftJoin(pr, eq(pr.did, p.did))
      .leftJoin(pa, eq(pa.did, d.did))
      .where(and(where, eq(d.deleted, false)))
      .orderBy(desc(rec.createdAt), desc(rec.uri))
      .limit(opts.limit)
      .offset(opts.offset ?? 0),
  ]);

  const items = rows
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
    .map((row) =>
      toArticleCard({
        ...row,
        featured: row.featured ?? false,
      }),
    );

  return {
    items,
    total: countRow[0]?.count ?? 0,
  };
}

/**
 * Publications one DID owns *or is featured in* — someone else's publication
 * that carries a post they wrote or are credited on as a contributor. Owned
 * ones sort first, then each group by most recent activity, then name. Callers
 * tell the two apart by comparing `card.did` to the profile DID, and label the
 * borrowed ones "Featured in". Excludes blento.app platform profiles.
 *
 * Publications that opted out of discovery (`showInDiscover = false`) are hidden
 * from everyone except the owner viewing their own profile: pass
 * `includeHidden: true` (only when the viewer *is* the owner) to keep them in the
 * result so the UI can render them dimmed with an explanatory label. The
 * `hiddenFromDiscover` flag on each returned card marks which ones. That escape
 * hatch is owner-only by construction, so it never unhides a *featured* pub —
 * those belong to someone else.
 */
export async function authorPublications(
  db: Db,
  schema: Schema,
  opts: {
    did: string;
    limit: number;
    offset?: number;
    includeHidden?: boolean;
  },
): Promise<Array<PublicationCard>> {
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;
  const sortName = publicationSortNameSql(p.name, p.url);

  const rows = await db
    .select(publicationCardColumns(schema))
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(
      and(
        eq(p.deleted, false),
        sql`${p.url} not ilike ${EXCLUDED_PUBLICATION_URL_PATTERN}`,
        or(
          and(
            eq(p.did, opts.did),
            opts.includeHidden ? undefined : eq(p.showInDiscover, true),
          ),
          and(
            featuredInPublication(schema, opts.did),
            eq(p.showInDiscover, true),
          ),
        ),
      ),
    )
    .orderBy(
      // Owned publications lead; `true` sorts before `false` under DESC.
      sql`(${p.did} = ${opts.did}) desc`,
      sql`${st.lastDocumentAt} desc nulls last`,
      asc(sortName),
      asc(p.uri),
    )
    .limit(opts.limit)
    .offset(opts.offset ?? 0);

  return rows.map((row) => toPublicationCard(row));
}

/**
 * Every document this DID has a byline on — `site.standard.document` records
 * in their own repo, whether attached to one of their own publications, to
 * someone else's, or "loose" (an `https://` `site` with no matching publication
 * row), *plus* records in another repo that credit them as a contributor.
 * Newest first. Backs the "Posts" tab of the author profile, so authors who
 * publish off-platform (e.g. Leaflet-hosted) or guest-write for other
 * publications have all of their writing listed in one place.
 */
export async function authorDocuments(
  db: Db,
  schema: Schema,
  opts: { did: string; limit: number; offset?: number },
): Promise<AuthorActivityPage<ArticleCard>> {
  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const pa = alias(schema.profiles, "pa");
  const dc = schema.documentContributors;
  const offset = opts.offset ?? 0;
  const published = and(
    eq(d.deleted, false),
    documentPublishedNotInFuture(d),
  ) as SQL;

  // Two *disjoint* branches, each on its own index, merged here rather than in
  // SQL. A single `d.did = $did or exists (contributor row)` is unindexable:
  // Postgres seq-scans all ~380k documents, and for the largest repo (~272k
  // docs) that is several seconds. Branch A rides
  // `documents_did_published_idx` exactly as it did before contributors were
  // included; branch B rides `document_contributors_did_idx` and is empty for
  // the overwhelming majority of authors. `ne(d.did, ...)` in branch B makes
  // the two sets disjoint, so totals add and the merge needs no dedupe.
  const rowColumns = {
    ...articleCardColumns(schema),
    isRead: documentReadExistsColumn(schema, opts.did),
  };
  // Each branch must yield the whole head of the merged list, since either one
  // could supply every row up to `offset + limit`.
  const head = offset + opts.limit;
  const ownWhere = and(eq(d.did, opts.did), published) as SQL;
  const creditWhere = and(
    eq(dc.did, opts.did),
    ne(d.did, opts.did),
    published,
  ) as SQL;

  const [ownCount, creditCount, ownRows, creditRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
      .from(d)
      .where(ownWhere),
    db
      .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
      .from(dc)
      .innerJoin(d, eq(d.uri, dc.documentUri))
      .where(creditWhere),
    // `pr` (publication owner profile) is null for loose documents
    // (publication_uri IS NULL → no `p` row → no `pr` match), but
    // `articleCardColumns` references `pr.avatarUrl`/`pr.handle`/`pr.bannerUrl`,
    // so the table must be present in the query or Drizzle throws.
    db
      .select(rowColumns)
      .from(d)
      .leftJoin(p, eq(p.uri, d.publicationUri))
      .leftJoin(pr, eq(pr.did, p.did))
      .leftJoin(pa, eq(pa.did, d.did))
      .where(ownWhere)
      .orderBy(...documentsNewestFirst(d))
      .limit(head),
    db
      .select(rowColumns)
      .from(dc)
      .innerJoin(d, eq(d.uri, dc.documentUri))
      .leftJoin(p, eq(p.uri, d.publicationUri))
      .leftJoin(pr, eq(pr.did, p.did))
      .leftJoin(pa, eq(pa.did, d.did))
      .where(creditWhere)
      .orderBy(...documentsNewestFirst(d))
      .limit(head),
  ]);

  const merged =
    creditRows.length === 0
      ? ownRows
      : [...ownRows, ...creditRows].toSorted(
          (a, b) =>
            b.publishedAt.getTime() - a.publishedAt.getTime() ||
            b.uri.localeCompare(a.uri),
        );

  return {
    items: merged
      .slice(offset, offset + opts.limit)
      .map((row) => toArticleCard(row)),
    total: (ownCount[0]?.count ?? 0) + (creditCount[0]?.count ?? 0),
  };
}
