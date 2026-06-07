/**
 * Shared read-model query helpers for the data layer (`APP_VISION.md` §5).
 *
 * These are pure functions over the Drizzle client + schema (threaded in from a
 * server fn's `dbMiddleware` context), so the same logic backs both the Home
 * rails and the Discover sections without duplicating SQL. The discovery
 * rankings here are deliberately simple reads over the precomputed aggregates
 * (`publication_stats`, `publication_cosubscriptions`). Discover rails dedupe
 * against the trending set so Recommended / social-proof rails stay distinct.
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

export interface ArticleCardQuery {
  /** Restrict to documents in these publications (e.g. a reader's follows). */
  publicationUris?: Array<string>;
  /** When set, only documents this DID has NOT marked read (unread filter). */
  unreadForDid?: string;
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
    conds.push(isNotNull(d.publicationUri), eq(p.showInDiscover, true));
  }

  let query = db
    .select(articleCardColumns(schema))
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

/**
 * Replace stale `publication_stats` counts with live subscription/document
 * totals — used on rails where the header already does the same refresh.
 */
export async function withLivePublicationCounts(
  db: Db,
  schema: Schema,
  pubs: Array<PublicationCard>,
): Promise<Array<PublicationCard>> {
  if (pubs.length === 0) {
    return pubs;
  }

  const uris = pubs.map((pub) => pub.uri);
  const sub = schema.subscriptions;
  const doc = schema.documents;

  const [subRows, docRows] = await Promise.all([
    db
      .select({
        publicationUri: sub.publicationUri,
        subscriberCount:
          sql<number>`count(distinct ${sub.subscriberDid}) filter (where ${sub.deleted} = false)`.mapWith(
            Number,
          ),
      })
      .from(sub)
      .where(inArray(sub.publicationUri, uris))
      .groupBy(sub.publicationUri),
    db
      .select({
        publicationUri: doc.publicationUri,
        documentCount: sql<number>`count(*)`.mapWith(Number),
      })
      .from(doc)
      .where(and(inArray(doc.publicationUri, uris), eq(doc.deleted, false)))
      .groupBy(doc.publicationUri),
  ]);

  const subsByUri = new Map(
    subRows.map((row) => [row.publicationUri, row.subscriberCount]),
  );
  const docsByUri = new Map(
    docRows.map((row) => [row.publicationUri, row.documentCount]),
  );

  return pubs.map((pub) => ({
    ...pub,
    subscriberCount: subsByUri.get(pub.uri) ?? 0,
    documentCount: docsByUri.get(pub.uri) ?? 0,
  }));
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
    eq(p.showInDiscover, true),
    eq(p.deleted, false),
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
 * Trending publications ranked by live 7-day activity (documents, subscribers,
 * recommends). Requires at least one indexed article and one subscriber so
 * empty shells never surface when `publication_stats` is stale or all-zero.
 */
export async function trendingPublications(
  db: Db,
  _schema: Schema,
  limit: number,
): Promise<Array<PublicationCard>> {
  const rows = await selectLiveTrendingPublicationRows(db, limit);
  return rows.map((row) => toPublicationCard(row));
}

/** URIs of the current trending set — used to dedupe other Discover rails. */
export async function trendingPublicationUris(
  db: Db,
  _schema: Schema,
  limit: number,
): Promise<Array<string>> {
  const rows = await selectLiveTrendingPublicationRows(db, limit);
  return rows.map((row) => row.uri);
}

type LiveTrendingPublicationRow = Parameters<typeof toPublicationCard>[0];

async function selectLiveTrendingPublicationRows(
  db: Db,
  limit: number,
): Promise<Array<LiveTrendingPublicationRow>> {
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
      coalesce(subs.cnt, 0)::int AS "subscriberCount",
      coalesce(docs.cnt, 0)::int AS "documentCount",
      st.last_document_at AS "lastDocumentAt"
    FROM publications p
    LEFT JOIN profiles pr ON pr.did = p.did
    LEFT JOIN publication_stats st ON st.publication_uri = p.uri
    LEFT JOIN (
      SELECT publication_uri,
             count(DISTINCT subscriber_did) AS cnt,
             count(DISTINCT subscriber_did) FILTER (
               WHERE coalesce(created_at, indexed_at) > now() - interval '7 days'
             ) AS cnt7
      FROM subscriptions
      WHERE deleted = false
      GROUP BY publication_uri
    ) subs ON subs.publication_uri = p.uri
    LEFT JOIN (
      SELECT publication_uri,
             count(*) AS cnt,
             count(*) FILTER (
               WHERE published_at > now() - interval '7 days'
             ) AS cnt7
      FROM documents
      WHERE deleted = false AND publication_uri IS NOT NULL
      GROUP BY publication_uri
    ) docs ON docs.publication_uri = p.uri
    LEFT JOIN (
      SELECT doc.publication_uri,
             count(*) FILTER (
               WHERE coalesce(rc.created_at, rc.indexed_at) > now() - interval '7 days'
             ) AS cnt7
      FROM recommends rc
      JOIN documents doc ON doc.uri = rc.document_uri
      WHERE rc.deleted = false AND doc.publication_uri IS NOT NULL
      GROUP BY doc.publication_uri
    ) recs ON recs.publication_uri = p.uri
    WHERE p.show_in_discover = true
      AND p.deleted = false
      AND coalesce(docs.cnt, 0) > 0
      AND coalesce(subs.cnt, 0) > 0
    ORDER BY
      (
        coalesce(docs.cnt7, 0) * 3.0
        + coalesce(subs.cnt7, 0) * 2.0
        + coalesce(recs.cnt7, 0) * 1.0
      ) DESC,
      coalesce(subs.cnt, 0) DESC,
      coalesce(docs.cnt, 0) DESC,
      p.name ASC
    LIMIT ${limit}
  `);

  return result.rows as Array<LiveTrendingPublicationRow>;
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
 * live subscription totals (Readers), latest indexed article (Active), or
 * display name (A–Z). Avoids stale `publication_stats` aggregates.
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
  const sub = schema.subscriptions;
  const doc = schema.documents;

  const subsAgg = db
    .select({
      publicationUri: sub.publicationUri,
      subscriberCount:
        sql<number>`count(distinct ${sub.subscriberDid}) filter (where ${sub.deleted} = false)`.as(
          "subscriber_count",
        ),
    })
    .from(sub)
    .groupBy(sub.publicationUri)
    .as("subs_agg");

  const docsAgg = db
    .select({
      publicationUri: doc.publicationUri,
      documentCount: sql<number>`count(*)`.as("document_count"),
      lastDocumentAt: sql<Date | null>`max(${doc.publishedAt})`.as(
        "last_document_at",
      ),
    })
    .from(doc)
    .where(and(eq(doc.deleted, false), isNotNull(doc.publicationUri)))
    .groupBy(doc.publicationUri)
    .as("docs_agg");

  const effectiveTopic = publicationEffectiveTopicSql(p);

  const conds = [eq(p.showInDiscover, true), eq(p.deleted, false)];
  if (topic) {
    conds.push(sql`lower(btrim(${effectiveTopic})) = lower(btrim(${topic}))`);
  }

  const trimmedQuery = query?.trim() ?? "";
  const tsq = trimmedQuery
    ? sql`websearch_to_tsquery('english', ${trimmedQuery})`
    : null;
  const likePattern = trimmedQuery ? `%${trimmedQuery}%` : null;

  if (trimmedQuery && tsq && likePattern) {
    conds.push(
      or(
        sql`${p.searchVector} @@ ${tsq}`,
        ilike(p.url, likePattern),
        ilike(pr.handle, likePattern),
        sql`lower(btrim(coalesce(${effectiveTopic}, ''))) like lower(${likePattern})`,
      )!,
    );
  }

  const sortName = publicationSortNameSql(p.name, p.url);

  const sortTieBreak =
    sort === "az"
      ? [asc(sortName), asc(p.uri)]
      : sort === "active"
        ? [
            sql`${docsAgg.lastDocumentAt} desc nulls last`,
            asc(sortName),
            asc(p.uri),
          ]
        : [
            sql`coalesce(${subsAgg.subscriberCount}, 0) desc`,
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
      subscriberCount:
        sql<number>`coalesce(${subsAgg.subscriberCount}, 0)`.mapWith(Number),
      documentCount: sql<number>`coalesce(${docsAgg.documentCount}, 0)`.mapWith(
        Number,
      ),
      lastDocumentAt: docsAgg.lastDocumentAt,
    })
    .from(p)
    .leftJoin(subsAgg, eq(subsAgg.publicationUri, p.uri))
    .leftJoin(docsAgg, eq(docsAgg.publicationUri, p.uri))
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
    eq(p.showInDiscover, true),
    eq(p.deleted, false),
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
    .orderBy(sql`coalesce(${st.subscriberCount}, 0) desc`)
    .limit(limit);
  return rows.map((row) => toPublicationCard(row));
}

/**
 * "Recommended for you" — collaborative filtering over the co-subscription
 * graph: publications co-followed by the readers of the ones you already follow,
 * scored by summed co-subscription similarity. Cold-start / sparse-graph readers
 * fall back to established publications (high readership, excluding the trending
 * set) so the rail stays distinct from Trending.
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

  const cs = schema.publicationCosubscriptions;
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;

  const cosubConds = [
    inArray(cs.publicationUri, followUris),
    notInArray(cs.relatedPublicationUri, followUris),
  ];
  if (excludeUris.length > 0) {
    cosubConds.push(notInArray(cs.relatedPublicationUri, excludeUris));
  }

  const agg = db
    .select({
      relatedUri: cs.relatedPublicationUri,
      score: sql<number>`sum(${cs.score})`.as("score"),
    })
    .from(cs)
    .where(and(...cosubConds))
    .groupBy(cs.relatedPublicationUri)
    .as("cosub_agg");

  const rows = await db
    .select(publicationCardColumns(schema))
    .from(agg)
    .innerJoin(p, eq(p.uri, agg.relatedUri))
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(
      and(
        eq(p.showInDiscover, true),
        eq(p.deleted, false),
        hasIndexedDocuments(db, schema, p.uri),
      ),
    )
    .orderBy(desc(agg.score))
    .limit(limit);

  const primary = rows.map((row) => toPublicationCard(row));
  return backfillPublicationRail(
    db,
    schema,
    primary,
    limit,
    mergeExcludeUris(excludeUris, followUris),
  );
}

/**
 * "Followed by people you follow" — publications co-subscribed by readers who
 * also follow the ones you already follow, ranked by overlapping subscriber count.
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
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;

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

  const agg = db
    .select({
      publicationUri: sub.publicationUri,
      score: sql<number>`count(distinct ${sub.subscriberDid})`.as("score"),
    })
    .from(sub)
    .innerJoin(coReaders, eq(coReaders.did, sub.subscriberDid))
    .where(and(...subConds))
    .groupBy(sub.publicationUri)
    .as("social_agg");

  const rows = await db
    .select(publicationCardColumns(schema))
    .from(agg)
    .innerJoin(p, eq(p.uri, agg.publicationUri))
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(eq(p.showInDiscover, true), eq(p.deleted, false)))
    .orderBy(desc(agg.score))
    .limit(limit);

  return rows.map((row) => toPublicationCard(row));
}

/**
 * "Readers also follow" for a publication profile — its top co-subscribed
 * publications by similarity score.
 */
export async function readersAlsoFollow(
  db: Db,
  schema: Schema,
  publicationUri: string,
  limit: number,
): Promise<Array<PublicationCard>> {
  const cs = schema.publicationCosubscriptions;
  const p = schema.publications;
  const st = schema.publicationStats;
  const pr = schema.profiles;

  const rows = await db
    .select(publicationCardColumns(schema))
    .from(cs)
    .innerJoin(p, eq(p.uri, cs.relatedPublicationUri))
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(
      and(
        eq(cs.publicationUri, publicationUri),
        eq(p.showInDiscover, true),
        eq(p.deleted, false),
      ),
    )
    .orderBy(desc(cs.score))
    .limit(limit);
  return rows.map((row) => toPublicationCard(row));
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
