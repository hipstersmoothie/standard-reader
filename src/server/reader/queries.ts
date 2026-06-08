/**
 * Shared read-model query helpers for the data layer (`APP_VISION.md` §5).
 *
 * These are pure functions over the Drizzle client + schema (threaded in from a
 * server fn's `dbMiddleware` context), so the same logic backs both the Home
 * rails and the Discover sections without duplicating SQL. The discovery
 * rankings here are deliberately simple reads over the precomputed aggregates
 * (`publication_stats`, `publication_cosubscriptions`,
 * `publication_corecommends`). Likes (`site.standard.graph.recommend`) feed
 * trending, popularity, and personalized rails alongside subscriptions.
 * Discover rails dedupe against the trending set so Recommended / social-proof
 * rails stay distinct.
 */

import type {
  ArticleCard,
  Db,
  PublicationCard,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";

import {
  articleCardColumns,
  publicationCardColumns,
  publicationSortNameSql,
  toArticleCard,
  toPublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import { EXCLUDED_PUBLICATION_URL_PATTERN } from "#/lib/publication/exclusions";
import { discoverEligiblePublicationWhere } from "#/server/reader/publication-filters";
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
  limit: number;
  offset?: number;
}

/**
 * Newest-first {@link ArticleCard}s, filtered to follows / unread / featured /
 * discover-eligible as requested. Returns `[]` when `publicationUris` is set but
 * empty (a reader with no follows), avoiding an `IN ()` that can never match.
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
  const r = schema.reads;

  const conds = [eq(d.deleted, false)];
  if (opts.publicationUris) {
    conds.push(inArray(d.publicationUri, opts.publicationUris));
  }
  if (opts.featuredOnly) {
    conds.push(eq(d.featured, true));
  }
  if (opts.discoverOnly) {
    conds.push(
      isNotNull(d.publicationUri),
      discoverEligiblePublicationWhere(p),
    );
  }

  const columns = articleCardColumns(schema);
  const selection = opts.readForDid
    ? {
        ...columns,
        isRead: sql<boolean>`exists(
          select 1
          from ${r}
          where ${r.documentUri} = ${d.uri}
            and ${r.ownerDid} = ${opts.readForDid}
            and ${r.deleted} = false
        )`.mapWith(Boolean),
      }
    : columns;

  let query = db
    .select(selection)
    .from(d)
    .leftJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(pr, eq(pr.did, p.did))
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
 * The reader's followed publications as {@link PublicationCard}s, alphabetical
 * by name — backs the sidebar "Following" list. Returns `[]` for readers with
 * no follows.
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
  const rows = await db
    .select(publicationCardColumns(schema))
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(inArray(p.uri, publicationUris), eq(p.deleted, false)))
    .orderBy(p.name);
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
      and(eq(d.deleted, false), inArray(d.publicationUri, publicationUris)),
    );

  return { all: row?.all ?? 0, unread: row?.unread ?? 0 };
}

// ── Discovery rails (reads over precomputed aggregates) ─────────────────────

/**
 * Discover-eligible articles ranked by recent network activity (recommends in
 * the last 7 days, boosted by the parent publication's trending score).
 */
export async function trendingArticles(
  db: Db,
  schema: Schema,
  limit: number,
  excludeUris: Array<string> = [],
): Promise<Array<ArticleCard>> {
  const d = schema.documents;
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;
  const rc = schema.recommends;

  const recAgg = db
    .select({
      documentUri: rc.documentUri,
      cnt7: sql<number>`count(*) filter (where coalesce(${rc.createdAt}, ${rc.indexedAt}) > now() - interval '7 days')`.as(
        "cnt7",
      ),
    })
    .from(rc)
    .where(eq(rc.deleted, false))
    .groupBy(rc.documentUri)
    .as("rec_agg");

  const conds = [
    eq(d.deleted, false),
    isNotNull(d.publicationUri),
    discoverEligiblePublicationWhere(p),
    sql`${d.publishedAt} > now() - interval '60 days'`,
  ];
  if (excludeUris.length > 0) {
    conds.push(notInArray(d.uri, excludeUris));
  }

  const rows = await db
    .select(articleCardColumns(schema))
    .from(d)
    .innerJoin(p, eq(p.uri, d.publicationUri))
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .leftJoin(recAgg, eq(recAgg.documentUri, d.uri))
    .where(and(...conds))
    .orderBy(
      desc(
        sql`(coalesce(${recAgg.cnt7}, 0) * 3.0 + coalesce(${st.trendingScore}, 0))`,
      ),
      desc(d.publishedAt),
    )
    .limit(limit);

  return rows.map((row) => toArticleCard(row));
}

/**
 * Trending publications ranked by the precomputed `publication_stats`
 * (`trending_score` = rolling-window new docs + follow velocity + likes,
 * recomputed on a schedule by `recomputeDerived()`). Requires at least one
 * indexed article and one subscriber so empty shells never surface.
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
      p.icon_url AS "iconUrl",
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
export async function discoverDirectoryPublications(
  db: Db,
  schema: Schema,
  {
    topic = null,
    sort,
    limit,
    offset,
    query = null,
  }: {
    topic?: string | null;
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
    conds.push(sql`lower(btrim(${effectiveTopic})) = lower(btrim(${topic}))`);
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
      iconUrl: p.iconUrl,
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

export interface PublicationRailOpts {
  /** Publication URIs to omit (e.g. the current trending set). */
  excludeUris?: Array<string>;
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
  const followUris = await selectFollowUris(db, schema, did);
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
  const followUris = await selectFollowUris(db, schema, did);
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
