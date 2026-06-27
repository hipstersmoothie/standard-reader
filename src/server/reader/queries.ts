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

import type {
  ArticleCard,
  Db,
  PublicationCard,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import type { SQL } from "drizzle-orm";

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
  MIN_ARTICLE_RECOMMENDERS,
  TRENDING_MAX_AGE_DAYS,
  applyTrendingDiversityCaps,
  trendingFetchPoolSize,
} from "#/server/reader/trending-scoring";
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
  limit: number;
  offset?: number;
}

/**
 * Inline `isRead` for a reader. Qualifies the outer `documents.uri` — unqualified
 * `${d.uri}` in a subquery compiles to `"uri"` and breaks correlation.
 */
function documentReadExistsColumn(
  schema: Schema,
  readForDid: string,
): SQL<boolean> {
  const r = schema.reads;
  return sql<boolean>`exists(
    select 1
    from ${r}
    where ${r.documentUri} = "documents"."uri"
      and ${r.ownerDid} = ${readForDid}
      and ${r.deleted} = false
  )`.mapWith(Boolean);
}

/**
 * Newest-first {@link ArticleCard}s, filtered to follows / unread / featured /
 * discover-eligible as requested. Excludes posts whose `publishedAt` is still in
 * the future. Returns `[]` when `publicationUris` is set but empty (a reader with
 * no follows), avoiding an `IN ()` that can never match.
 */
export async function selectArticleCards(
  db: Db,
  schema: Schema,
  opts: ArticleCardQuery,
): Promise<Array<ArticleCard>> {
  if (opts.publicationUris && opts.publicationUris.length === 0) {
    return [];
  }

  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const pa = schema.profiles;
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
        isRead: documentReadExistsColumn(schema, opts.readForDid),
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
  }

  const rows = await query
    .where(and(...conds))
    .orderBy(desc(d.publishedAt), desc(d.uri))
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
        isRead: documentReadExistsColumn(schema, opts.readForDid),
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
    .orderBy(desc(d.publishedAt), desc(d.uri))
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

/** Unread document AT-URIs for a reader, optionally scoped to publications. */
export async function selectUnreadDocumentUris(
  db: Db,
  schema: Schema,
  opts: {
    readerDid: string;
    publicationUris?: Array<string>;
    limit?: number;
  },
): Promise<Array<string>> {
  const { readerDid, publicationUris, limit = 500 } = opts;
  if (publicationUris && publicationUris.length === 0) {
    return [];
  }

  const d = schema.documents;
  const r = schema.reads;

  const conds = [eq(d.deleted, false), documentPublishedNotInFuture(d)];
  if (publicationUris) {
    conds.push(inArray(d.publicationUri, publicationUris));
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
    .orderBy(desc(d.publishedAt), desc(d.uri))
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

/** Count of unread documents across a reader's follows (for the Latest filter). */
export async function countFollowedDocuments(
  db: Db,
  schema: Schema,
  publicationUris: Array<string>,
  did: string,
): Promise<{ all: number; unread: number }> {
  if (publicationUris.length === 0) {
    return { all: 0, unread: 0 };
  }
  const d = schema.documents;
  const r = schema.reads;
  const [row] = await db
    .select({
      all: sql<number>`count(*)`.mapWith(Number),
      unread: sql<number>`count(*) filter (where ${r.uri} is null)`.mapWith(
        Number,
      ),
    })
    .from(d)
    .leftJoin(
      r,
      and(eq(r.documentUri, d.uri), eq(r.ownerDid, did), eq(r.deleted, false)),
    )
    .where(
      and(
        eq(d.deleted, false),
        documentPublishedNotInFuture(d),
        inArray(d.publicationUri, publicationUris),
      ),
    );

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

/** Unread document counts keyed by publication AT-URI for a reader's follows. */
export async function countUnreadByPublication(
  db: Db,
  schema: Schema,
  publicationUris: Array<string>,
  did: string,
): Promise<Map<string, number>> {
  if (publicationUris.length === 0) {
    return new Map();
  }
  const d = schema.documents;
  const r = schema.reads;
  const rows = await db
    .select({
      publicationUri: d.publicationUri,
      unread: sql<number>`count(*) filter (where ${r.uri} is null)`.mapWith(
        Number,
      ),
    })
    .from(d)
    .leftJoin(
      r,
      and(eq(r.documentUri, d.uri), eq(r.ownerDid, did), eq(r.deleted, false)),
    )
    .where(
      and(
        eq(d.deleted, false),
        documentPublishedNotInFuture(d),
        inArray(d.publicationUri, publicationUris),
        isNotNull(d.publicationUri),
      ),
    )
    .groupBy(d.publicationUri);

  return new Map(
    rows.flatMap((row) =>
      row.publicationUri ? [[row.publicationUri, row.unread]] : [],
    ),
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
  const pa = schema.profiles;

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
function documentCarriesTagWhere(d: Schema["documents"], tag: string): SQL {
  return sql`exists (
    select 1
    from unnest(${d.tags}) as doc_tag
    where btrim(doc_tag) <> ''
      and lower(btrim(doc_tag)) = lower(btrim(${tag}))
  )`;
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
    from ${d} doc, unnest(doc.tags) as doc_tag
    where doc.publication_uri = ${p.uri}
      and doc.deleted = false
      and doc.published_at <= now()
      and btrim(doc_tag) <> ''
      and lower(btrim(doc_tag)) = lower(btrim(${tag}))
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
    from ${d} doc, unnest(doc.tags) as doc_tag
    where doc.publication_uri = ${p.uri}
      and doc.deleted = false
      and doc.published_at <= now()
      and btrim(doc_tag) <> ''
      and lower(btrim(doc_tag)) = lower(btrim(${tag}))
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
 * social signal).
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
      score: sql<number>`count(distinct ${rc.recommenderDid})`.mapWith(Number),
    })
    .from(rc)
    .innerJoin(doc, eq(doc.uri, rc.documentUri))
    .innerJoin(coReaders, eq(coReaders.did, rc.recommenderDid))
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
  );
  return [...primary, ...backfill].slice(0, limit);
}

/**
 * Most-subscribed discover-eligible publications (cold-start "popular"), with an
 * optional exclusion set (e.g. publications the reader already follows).
 */
export async function popularPublications(
  db: Db,
  schema: Schema,
  limit: number,
  excludeUris: Array<string> = [],
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
    .limit(limit);
  return rows.map((row) => toPublicationCard(row));
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
  const followUris =
    opts.followUris ?? (await selectFollowUris(db, schema, did));
  if (followUris.length === 0) {
    return popularPublications(db, schema, limit, excludeUris);
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

  const primary = await publicationCardsByOrderedUris(
    db,
    schema,
    ranked.slice(0, limit).map((row) => row.uri),
  );

  return backfillPublicationRail(db, schema, primary, limit, mergedExclude);
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

  return publicationCardsByOrderedUris(
    db,
    schema,
    ranked.slice(0, limit).map((row) => row.uri),
  );
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
  opts?: { lite?: boolean },
): Promise<Array<ArticleCard>> {
  if (uris.length === 0) {
    return [];
  }

  const d = schema.documents;
  const p = schema.publications;
  const pr = schema.profiles;
  const pa = schema.profiles;
  const rows = await db
    .select(
      opts?.lite ? articleQueueCardColumns(schema) : articleCardColumns(schema),
    )
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
 * Aggregate stats for an author profile header: owned publications plus
 * `site.standard.graph.subscription` / `recommend` activity. `documentCount`
 * sums per-publication stats *and* adds loose documents (records whose `site`
 * is an `https://` URL with no matching publication) authored by this DID, so
 * authors who publish off-platform still show a real article total.
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

  const [pubRow, subRow, recRow, looseRow] = await Promise.all([
    db
      .select({
        publicationCount: sql<number>`count(*)::int`.mapWith(Number),
        documentCount:
          sql<number>`coalesce(sum(${st.documentCount}), 0)::int`.mapWith(
            Number,
          ),
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
    db
      .select({
        count: sql<number>`count(distinct ${sub.publicationUri})::int`.mapWith(
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
    // Loose documents (no publication) authored by this DID — not covered by
    // the per-publication stats sum above.
    db
      .select({
        count: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(d)
      .where(
        and(
          eq(d.did, did),
          eq(d.deleted, false),
          isNull(d.publicationUri),
          documentPublishedNotInFuture(d),
        ),
      ),
  ]);

  return {
    publicationCount: pubRow[0]?.publicationCount ?? 0,
    documentCount: (pubRow[0]?.documentCount ?? 0) + (looseRow[0]?.count ?? 0),
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

/**
 * Publications this DID subscribes to (`site.standard.graph.subscription`),
 * newest subscription first.
 */
export async function authorSubscriptions(
  db: Db,
  schema: Schema,
  opts: { did: string; limit: number; offset?: number },
): Promise<AuthorActivityPage<PublicationCard>> {
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
  };
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
  const pa = schema.profiles;
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
 * Publications owned by one DID, ordered by most recent activity then name.
 * Excludes blento.app platform profiles.
 */
export async function authorPublications(
  db: Db,
  schema: Schema,
  opts: { did: string; limit: number; offset?: number },
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
        eq(p.did, opts.did),
        eq(p.deleted, false),
        sql`${p.url} not ilike ${EXCLUDED_PUBLICATION_URL_PATTERN}`,
      ),
    )
    .orderBy(
      sql`${st.lastDocumentAt} desc nulls last`,
      asc(sortName),
      asc(p.uri),
    )
    .limit(opts.limit)
    .offset(opts.offset ?? 0);

  return rows.map((row) => toPublicationCard(row));
}

/**
 * Loose documents authored by this DID — `site.standard.document` records
 * whose `site` is an `https://` URL with no matching publication row
 * (`publication_uri IS NULL`). Newest first. Backs the "Documents" section
 * of the author profile so authors who publish off-platform (e.g. Leaflet-
 * hosted) still have their writing listed.
 */
export async function authorLooseDocuments(
  db: Db,
  schema: Schema,
  opts: { did: string; limit: number; offset?: number },
): Promise<AuthorActivityPage<ArticleCard>> {
  const d = schema.documents;
  const p = schema.publications;
  const pa = schema.profiles;
  const where = and(
    eq(d.did, opts.did),
    eq(d.deleted, false),
    isNull(d.publicationUri),
    documentPublishedNotInFuture(d),
  );

  const [countRow, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
      .from(d)
      .where(where),
    db
      .select({
        ...articleCardColumns(schema),
        isRead: documentReadExistsColumn(schema, opts.did),
      })
      .from(d)
      .leftJoin(p, eq(p.uri, d.publicationUri))
      .leftJoin(pa, eq(pa.did, d.did))
      .where(where)
      .orderBy(desc(d.publishedAt), desc(d.uri))
      .limit(opts.limit)
      .offset(opts.offset ?? 0),
  ]);

  return {
    items: rows.map((row) => toArticleCard(row)),
    total: countRow[0]?.count ?? 0,
  };
}
