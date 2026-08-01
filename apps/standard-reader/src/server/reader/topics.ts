import type { SQL } from "drizzle-orm";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type {
  Db,
  PublicationCard,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";
import {
  publicationCardColumns,
  toPublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import { WEB_BRIDGE_HANDLE_PATTERN } from "#/lib/atproto/bridged-repo";
import { EXCLUDED_PUBLICATION_URL_PATTERN } from "#/lib/publication/exclusions";
import { cdnImageUrl } from "#/server/atproto/blob";

import type { ArticleCardSort } from "./queries.ts";
import { rotateRail, ROTATION_POOL_MULTIPLIER } from "./rail-rotation.ts";

/** Read rows off a drizzle `db.execute` result (array or `{ rows }`). */
function executeRows<T>(result: unknown): Array<T> {
  if (Array.isArray(result)) return result as Array<T>;
  return ((result as { rows?: Array<T> }).rows ?? []) as Array<T>;
}

/**
 * Read path for auto-derived topics.
 *
 * Everything here reads the precomputed tables the recompute sweep writes (see
 * `#/server/ingest/recompute-topics`) — publications come straight off
 * `topic_publications`, and only the document feed is computed live, via
 * GIN array-overlap on the topic's tag set.
 */

/** Enough of a member publication to draw its avatar. */
export interface TopicAvatar {
  name: string;
  iconUrl: string | null;
  ownerAvatarUrl: string | null;
}

/** A topic as the Discover rail and the topic masthead need it. */
export interface TopicCard {
  slug: string;
  name: string;
  description: string | null;
  /** Highest-weight member tags — the topic's sub-areas. */
  tags: Array<string>;
  /**
   * A few member publications, for the card's avatar stack. A topic has no
   * image of its own and inventing one would be decoration; its members' icons
   * are both the visual anchor and the answer to "who is in here".
   */
  avatars: Array<TopicAvatar>;
  publicationCount: number;
  authorCount: number;
  documentCount: number;
}

/** Member avatars shown on a card. Four reads as a group without crowding. */
export const TOPIC_AVATARS = 4;
/**
 * Candidates fetched per topic so the page can avoid repeating a face.
 *
 * Big publications sit in several topics, so the top-scoring member of one
 * card is often the top-scoring member of the next; taking the top four of each
 * independently made one page show the same handful of icons over and over.
 * With a deeper pool each card can skip past whoever has already appeared.
 */
const TOPIC_AVATAR_POOL = TOPIC_AVATARS * 5;

/** Sub-area chips shown on a topic card in a rail. */
export const TOPIC_CARD_TAGS = 5;
/**
 * Tags carried by each row of the browse-all index. More than a rail card
 * shows, because the index searches over them — a reader looking for "vinyl"
 * should find Music even though the card never displays that tag.
 */
export const TOPIC_INDEX_TAGS = 24;

function topicCardColumns(schema: Schema) {
  const c = schema.topics;
  return {
    slug: c.slug,
    name: c.name,
    description: c.description,
    signatureTags: c.signatureTags,
    publicationCount: c.publicationCount,
    authorCount: c.authorCount,
    documentCount: c.documentCount,
  };
}

interface TopicRow {
  slug: string;
  name: string;
  description: string | null;
  signatureTags: Array<string>;
  publicationCount: number;
  authorCount: number;
  documentCount: number;
}

function toTopicCard(row: TopicRow, tagLimit: number): TopicCard {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    tags: row.signatureTags.slice(0, tagLimit),
    avatars: [],
    publicationCount: row.publicationCount,
    authorCount: row.authorCount,
    documentCount: row.documentCount,
  };
}

interface AvatarRow {
  slug: string;
  name: string;
  did: string;
  icon_cid: string | null;
  avatar_url: string | null;
}

/**
 * Identity of the *picture*, not the publication.
 *
 * Two publications owned by one writer both fall back to that writer's profile
 * avatar, so keying on the publication URI would still show the same face
 * twice. The DID is the last resort, for members with no image at all: their
 * initials circle is derived from the name, and a shared owner means a shared
 * initial.
 */
function avatarIdentity(avatar: TopicAvatar, did: string): string {
  return avatar.iconUrl ?? avatar.ownerAvatarUrl ?? did;
}

/**
 * Fill in each card's member avatars, in place.
 *
 * One lateral probe per topic rather than a query per card — the card lists
 * are short, but a round trip each would still be the most expensive thing on
 * the page. Publications that actually have an image sort first: a stack of
 * initials-fallback circles is worse than a smaller stack of real ones.
 *
 * Cards are then filled in display order, each skipping faces an earlier card
 * already used, so the page reads as a survey of the network rather than the
 * same four icons repeated down the column. A card that cannot fill its stack
 * from unused candidates shows a shorter one — repeating is the thing being
 * avoided, so falling back to it would defeat the point.
 */
async function attachTopicAvatars(
  db: Db,
  cards: Array<TopicCard>,
): Promise<Array<TopicCard>> {
  if (cards.length === 0) return cards;

  const slugs = sql.join(
    cards.map((card) => sql`${card.slug}`),
    sql`, `,
  );
  const result = await db.execute(sql`
    WITH wanted AS (SELECT unnest(array[${slugs}]) AS slug)
    SELECT w.slug, m.name, m.did, m.icon_cid, m.avatar_url
    FROM wanted w
    CROSS JOIN LATERAL (
      SELECT p.name, p.did, p.icon_cid, pr.avatar_url
      FROM topic_publications cp
      JOIN publications p ON p.uri = cp.publication_uri
      LEFT JOIN profiles pr ON pr.did = p.did
      WHERE cp.topic_slug = w.slug AND p.deleted = false
      ORDER BY (p.icon_cid IS NOT NULL OR pr.avatar_url IS NOT NULL) DESC,
               cp.score DESC, p.uri
      LIMIT ${TOPIC_AVATAR_POOL}
    ) AS m
  `);

  const bySlug = new Map<string, Array<{ avatar: TopicAvatar; id: string }>>();
  for (const row of executeRows<AvatarRow>(result)) {
    const list = bySlug.get(row.slug) ?? [];
    const avatar: TopicAvatar = {
      name: row.name,
      iconUrl: row.icon_cid ? cdnImageUrl(row.did, row.icon_cid, "png") : null,
      ownerAvatarUrl: row.avatar_url,
    };
    list.push({ avatar, id: avatarIdentity(avatar, row.did) });
    bySlug.set(row.slug, list);
  }

  const used = new Set<string>();
  for (const card of cards) {
    const picked: Array<TopicAvatar> = [];
    for (const candidate of bySlug.get(card.slug) ?? []) {
      if (picked.length === TOPIC_AVATARS) break;
      if (used.has(candidate.id)) continue;
      used.add(candidate.id);
      picked.push(candidate.avatar);
    }
    card.avatars = picked;
  }
  return cards;
}

/**
 * Topics for the Discover rail.
 *
 * Personalized when the reader follows anything: topics are ranked by how
 * many of the reader's publications sit inside them, so the rail leads with
 * what they already read rather than with the network's biggest topics. Signed
 * out — or with no overlap — it falls back to the global ranking.
 *
 * Either way the result is drawn from a wider pool and rotated by seed, so a
 * fixed ranking does not mean an unchanging rail (same treatment as the
 * publication rails; see `./rail-rotation`).
 */
export async function discoverTopics(
  db: Db,
  schema: Schema,
  {
    limit,
    followUris = [],
    seed,
  }: { limit: number; followUris?: Array<string>; seed?: string },
): Promise<Array<TopicCard>> {
  const c = schema.topics;
  const cp = schema.topicPublications;
  const poolSize = seed ? limit * ROTATION_POOL_MULTIPLIER : limit;

  if (followUris.length > 0) {
    const overlap = sql<number>`count(${cp.publicationUri})`;
    const rows = await db
      .select({ ...topicCardColumns(schema), overlap })
      .from(c)
      .leftJoin(
        cp,
        and(eq(cp.topicSlug, c.slug), inArray(cp.publicationUri, followUris)),
      )
      .where(eq(c.published, true))
      .groupBy(c.slug)
      .orderBy(desc(overlap), desc(c.score), c.slug)
      .limit(poolSize);

    if (rows.some((row) => Number(row.overlap) > 0)) {
      const cards = rows
        .filter((row) => Number(row.overlap) > 0)
        .map((row) => toTopicCard(row, TOPIC_CARD_TAGS));
      const picked = seed
        ? rotateRail(cards, limit, seed)
        : cards.slice(0, limit);
      return attachTopicAvatars(db, picked);
    }
  }

  const rows = await db
    .select(topicCardColumns(schema))
    .from(c)
    .where(eq(c.published, true))
    .orderBy(desc(c.score), c.slug)
    .limit(poolSize);
  const cards = rows.map((row) => toTopicCard(row, TOPIC_CARD_TAGS));
  const picked = seed ? rotateRail(cards, limit, seed) : cards.slice(0, limit);
  return attachTopicAvatars(db, picked);
}

/**
 * Every published topic, best first — the browse-all index.
 *
 * Returned whole rather than paginated: the published set is deliberately
 * small (tens, by the quality bar), and shipping it in one response is what
 * lets the index filter as the reader types instead of round-tripping per
 * keystroke.
 */
export async function listTopics(
  db: Db,
  schema: Schema,
  { limit = 250 }: { limit?: number } = {},
): Promise<Array<TopicCard>> {
  const c = schema.topics;
  const rows = await db
    .select(topicCardColumns(schema))
    .from(c)
    .where(eq(c.published, true))
    .orderBy(desc(c.score), c.slug)
    .limit(limit);
  return attachTopicAvatars(
    db,
    rows.map((row) => toTopicCard(row, TOPIC_INDEX_TAGS)),
  );
}

/** One topic, with its full sub-area list. Null when unknown or hidden. */
export async function topicBySlug(
  db: Db,
  schema: Schema,
  slug: string,
  { tagLimit = 40 }: { tagLimit?: number } = {},
): Promise<TopicCard | null> {
  const c = schema.topics;
  const rows = await db
    .select(topicCardColumns(schema))
    .from(c)
    .where(and(eq(c.slug, slug), eq(c.published, true)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const [card] = await attachTopicAvatars(db, [toTopicCard(row, tagLimit)]);
  return card ?? null;
}

/** Longest succession chain the redirect will follow. Also the cycle guard. */
const MAX_SUCCESSION_HOPS = 5;

export interface TopicRedirect {
  /** False when no such topic has ever existed — a genuine 404. */
  known: boolean;
  /** Published topic to redirect to; null means fall back to the index. */
  slug: string | null;
}

/**
 * Resolve an unpublished topic's slug to wherever its readers should land.
 *
 * A slug the table has never seen is a 404 — a typo or a guessed URL should
 * not be answered with a redirect. A slug it *has* seen always resolves to
 * something, because it was once a public link: either the topic that absorbed
 * it (following `superseded_by` transitively, since merges can chain) or the
 * index.
 *
 * Recursive rather than a loop of round trips: the region gap makes each query
 * expensive enough that a three-hop chain would be felt, and this is already
 * the slow path.
 */
export async function topicRedirectTarget(
  db: Db,
  slug: string,
): Promise<TopicRedirect> {
  const result = await db.execute(sql`
    WITH RECURSIVE chain(slug, superseded_by, published, depth) AS (
      SELECT t.slug, t.superseded_by, t.published, 0
      FROM topics t WHERE t.slug = ${slug}
      UNION ALL
      SELECT t.slug, t.superseded_by, t.published, c.depth + 1
      FROM chain c
      JOIN topics t ON t.slug = c.superseded_by
      WHERE c.published = false AND c.depth < ${MAX_SUCCESSION_HOPS}
    )
    SELECT
      (SELECT count(*)::int FROM chain) AS seen,
      (SELECT slug FROM chain WHERE published = true LIMIT 1) AS target
  `);

  const row = executeRows<{ seen: number; target: string | null }>(result)[0];
  if (!row || row.seen === 0) return { known: false, slug: null };
  return { known: true, slug: row.target };
}

/**
 * A topic's member tags, most central first — the sub-area chips, and the
 * tag set {@link topicDocumentTags} hands to the document query.
 */
export async function topicTagList(
  db: Db,
  schema: Schema,
  slug: string,
  limit = 60,
): Promise<Array<string>> {
  const ct = schema.topicTags;
  const rows = await db
    .select({ tag: ct.tag })
    .from(ct)
    .where(eq(ct.topicSlug, slug))
    .orderBy(desc(ct.weight), ct.tag)
    .limit(limit);
  return rows.map((row) => row.tag);
}

/**
 * Source and predicate for a topic's documents.
 *
 * Shared by the feed and its count so the two cannot drift.
 *
 * **A topic's articles come from a topic's publications.** This is the
 * rule that makes the two tabs describe the same thing, and skipping it is what
 * made the feed untrustworthy: matching the whole corpus by tag meant Wildlife
 * and Nature — whose members are nature photographers, so `photography` is one
 * of its central tags — served Spanish reporting on US military hardware,
 * because that publication also tags `photography`. Nine of its first ten
 * articles came from publications that were not in the topic at all, and
 * scoping to members cut the match set from 3,945 to 883.
 *
 * The cost is loose documents: a document with no publication row cannot be a
 * member of anything, so it never appears in a topic feed. That is the same
 * rule the Publications tab already implies, and `/tag/$tag` remains the
 * un-scoped view for anyone who wants the whole corpus on a subject.
 *
 * **Within those publications, belonging is the core tags.** A member
 * publication still writes about more than the topic's subject, so the tag
 * test stays: only the {@link TOPIC_CORE_TAGS} most central tags count, not
 * the broad tail (Middle East Geopolitics legitimately contains `china`, and an
 * article about downloadable AI models is not Middle East geopolitics).
 *
 * Also considered: *core tag OR any two member tags*, which recovers ~4% more.
 * Rejected — the two-tag branch needs a per-row array intersection the GIN index
 * cannot serve, and it took the slowest feed from ~250ms to 4.2s.
 *
 * The bridge test that remains is on the document's **author**: membership is
 * already built with bridged publications excluded, but a bridged author can
 * still post into a member publication. A null handle is never treated as
 * bridged — identity resolution fails for ordinary reasons, and hiding a real
 * publisher's article over a briefly unreachable DID document is worse.
 */
function topicDocumentFrom(slug: string): SQL {
  return sql`
    FROM documents d
    JOIN topic_publications cp
      ON cp.publication_uri = d.publication_uri
     AND cp.topic_slug = ${slug}
    JOIN publications p ON p.uri = d.publication_uri
    LEFT JOIN profiles apr ON apr.did = d.did
  `;
}

/**
 * How many of a topic's most central tags count as *core* — a tag specific
 * enough that an article in a member publication carrying it belongs.
 */
const TOPIC_CORE_TAGS = 10;

function topicDocumentWhere(tags: Array<string>): SQL {
  const coreTags = normalizedTagList(tags.slice(0, TOPIC_CORE_TAGS));

  return sql`
    d.deleted = false
    AND (d.published_at IS NULL OR d.published_at <= now())
    AND immutable_normalized_tags(d.tags) && array[${coreTags}]
    AND (apr.handle IS NULL OR apr.handle NOT ILIKE ${WEB_BRIDGE_HANDLE_PATTERN})
    AND p.deleted = false
    AND p.show_in_discover = true
    AND p.url NOT ILIKE ${EXCLUDED_PUBLICATION_URL_PATTERN}
  `;
}

/** Normalized tag list for the GIN array-overlap predicate. */
function normalizedTagList(tags: Array<string>): SQL {
  return sql.join(
    tags.map((tag) => sql`lower(btrim(${tag}))`),
    sql`, `,
  );
}

/**
 * Ordered document URIs for a topic's feed.
 *
 * The obvious form — one query filtering on the tag array and ordering by
 * `published_at DESC LIMIT n` — is a trap. Postgres estimates the array-overlap
 * filter as unselective, walks `documents_published_idx` in date order, and
 * discards non-matching rows until it has a page: measured at **1.65s** for a
 * narrow topic (47,237 rows discarded to return 24). The `MATERIALIZED`
 * CTE is what makes it fast — it forces the tag predicate to be evaluated
 * first, as a bitmap scan on `documents_tags_norm_idx`, leaving a few thousand
 * rows to top-N sort: the same query then runs in **18ms**.
 *
 * Do not "simplify" this into a single flat query, and do not drop the
 * `MATERIALIZED` keyword — without it Postgres is free to inline the CTE and
 * fall straight back into the slow plan.
 */
export async function selectTopicDocumentUris(
  db: Db,
  {
    slug,
    tags,
    sort = "recent",
    limit,
    offset = 0,
  }: {
    slug: string;
    tags: Array<string>;
    sort?: ArticleCardSort;
    limit: number;
    offset?: number;
  },
): Promise<Array<string>> {
  if (tags.length === 0) return [];

  // "Most liked" means likes, so it has to rank on the recommend count the
  // way every other article feed does (`articleCardOrderBy`) — ranking on
  // `backlink_count` alone made the tab a no-op, since almost no document has
  // a backlink and the ties fell back to newest-first. The count is only
  // computed for that sort: it is a correlated subquery per matched row, and
  // the other two orderings have no use for it.
  const popular = sort === "popular";
  const recommendCount = popular
    ? sql`, coalesce((
        SELECT count(*)::int FROM recommends r
        WHERE r.document_uri = d.uri AND r.deleted = false
      ), 0) AS recommend_count`
    : sql``;

  const orderBy = (() => {
    switch (sort) {
      case "trending": {
        return sql`m.trending_score desc, m.published_at desc nulls last`;
      }
      case "popular": {
        return sql`m.recommend_count desc, m.backlink_count desc,
                   m.published_at desc nulls last`;
      }
      default: {
        return sql`m.published_at desc nulls last`;
      }
    }
  })();

  const rows = await db.execute(sql`
    WITH matched AS MATERIALIZED (
      SELECT d.uri, d.published_at, d.trending_score,
             coalesce(d.backlink_count, 0) AS backlink_count${recommendCount}
      ${topicDocumentFrom(slug)}
      WHERE ${topicDocumentWhere(tags)}
    )
    SELECT m.uri FROM matched m
    ORDER BY ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `);

  return executeRows<{ uri: string }>(rows).map((row) => row.uri);
}

/** How many documents a topic's tag set matches, for the tab badge. */
export async function countTopicDocuments(
  db: Db,
  slug: string,
  tags: Array<string>,
): Promise<number> {
  if (tags.length === 0) return 0;
  const rows = await db.execute(sql`
    SELECT count(*)::int AS count
    ${topicDocumentFrom(slug)}
    WHERE ${topicDocumentWhere(tags)}
  `);
  return Number(executeRows<{ count: number }>(rows)[0]?.count ?? 0);
}

export type TopicDirectorySort = "belonging" | "readers" | "active" | "az";

/**
 * Publications in a topic, read straight off the precomputed membership
 * table. `belonging` (the default) orders by how much of the topic's tag
 * vocabulary a publication actually covers, which is a better lead than raw
 * subscriber count for a topic page.
 */
export async function topicPublicationCards(
  db: Db,
  schema: Schema,
  {
    slug,
    sort,
    limit,
    offset,
  }: {
    slug: string;
    sort: TopicDirectorySort;
    limit: number;
    offset: number;
  },
): Promise<Array<PublicationCard>> {
  const p = schema.publications;
  const pr = schema.profiles;
  const st = schema.publicationStats;
  const cp = schema.topicPublications;

  const orderBy = (() => {
    switch (sort) {
      case "readers": {
        return [desc(sql`coalesce(${st.subscriberCount}, 0)`), p.uri];
      }
      case "active": {
        return [sql`${st.lastDocumentAt} desc nulls last`, p.uri];
      }
      case "az": {
        return [p.name, p.uri];
      }
      default: {
        return [desc(cp.score), p.uri];
      }
    }
  })();

  const rows = await db
    .select(publicationCardColumns(schema))
    .from(cp)
    .innerJoin(p, eq(p.uri, cp.publicationUri))
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .leftJoin(pr, eq(pr.did, p.did))
    .where(and(eq(cp.topicSlug, slug), eq(p.deleted, false)))
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  return rows.map((row) => toPublicationCard(row));
}

/** How many publications a topic has, for the tab badge. */
export async function countTopicPublications(
  db: Db,
  schema: Schema,
  slug: string,
): Promise<number> {
  const cp = schema.topicPublications;
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cp)
    .where(eq(cp.topicSlug, slug));
  return Number(rows[0]?.count ?? 0);
}
