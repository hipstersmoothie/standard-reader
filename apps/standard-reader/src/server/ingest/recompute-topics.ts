import { and, eq, notInArray, sql } from "drizzle-orm";

import { WEB_BRIDGE_HANDLE_PATTERN } from "#/lib/atproto/bridged-repo";
import { chunk } from "#/lib/concurrency";
import { EXCLUDED_PUBLICATION_URL_PATTERN } from "#/lib/publication/exclusions";
import { logEvent } from "#/server/observability/log";

import { db } from "../../db/index.ts";
import { topics, topicPublications, topicTags } from "../../db/schema.ts";
import {
  clusterTags,
  cosineWeight,
  tagSetSimilarity,
} from "./tag-clustering.ts";
import { isTagEmbeddingEnabled, semanticTagEdges } from "./tag-embeddings.ts";
import {
  topicSlug,
  fallbackTopicName,
  isTopicNamingConfigured,
  nameTopics,
} from "./topic-naming.ts";
import { clearsRetentionBar, findSuccessors } from "./topic-succession.ts";

/**
 * Derive topics from the tag co-occurrence graph.
 *
 * See `src/db/schema/topics.ts` for what a topic is and
 * `./tag-clustering.ts` for the clustering itself. This module owns the SQL
 * that builds the graph, the quality bar, identity matching across sweeps, and
 * persistence.
 */

/**
 * Minimum publications carrying a tag for it to enter the graph. The full
 * vocabulary is 450k+ tags, almost all of them single-use; this trims it to a
 * few thousand that could plausibly anchor a topic.
 */
const MIN_TAG_PUBLICATIONS = 5;

/**
 * Placeholder words that are never a topic, only the absence of one.
 *
 * These reach the vocabulary honestly — `uncategorized` really is on 87
 * publications — but they carry no meaning to cluster on, so they act as weak
 * bridges between unrelated areas and end up as sub-area chips that tell a
 * reader nothing. Structural junk (emails, URLs, bare numbers, single letters)
 * is caught by pattern in {@link selectEdges} instead of listed here.
 *
 * Deliberately conservative: ambiguous words that could be a real subject stay
 * in. `notes` is a section on plenty of blogs, and the core-tag rule in the
 * feed already handles merely-generic tags.
 */
const JUNK_TAGS = [
  "uncategorized",
  "untitled",
  "other",
  "misc",
  "miscellaneous",
  "general",
  "none",
  "n/a",
  "null",
  "undefined",
  "tbd",
  "test",
  "todo",
  "draft",
  "read more",
  "readmore",
  "continue reading",
  // Named in review as meaningless artifacts rather than subjects.
  "note",
  "error",
  "overkill",
  "down",
  "replaced",
];
/**
 * Minimum *independent publishers* that must put both tags on the same article
 * for the pair to count as an edge. See {@link selectEdges} for why the unit is
 * publishers rather than documents.
 */
const MIN_EDGE_PUBLISHERS = 3;

/**
 * Bridgy Fed's passive web bridge shapes the clusters but is never shown.
 *
 * A `*.web.brid.gy` repo is a website Bridgy discovered and mirrored — nobody
 * at that site asked to be here (see `#/lib/atproto/bridged-repo`), so no
 * bridged publication or article ever appears in a topic. But the bridge is
 * **75% of the tagged corpus** (999k of 1.33M documents), and it is the only
 * evidence the network has that, say, `nasa` and `apollo` belong together.
 * Excluding it from the graph as well collapses the graph from 4,498 tags to
 * 502 and leaves **5** publishable topics; keeping it as a clustering
 * signal gives **44**, with nothing of it visible.
 *
 * So: the graph learns from everything, membership and the article feed are
 * restricted to publications and authors that opted in. Topic membership is
 * filtered here; the feed applies the matching author-level test in
 * `topicDocumentWhere` (`#/server/reader/topics`) — the author is the
 * load-bearing key there, because most bridged content is *loose* documents
 * with no publication row for a publication-level test to catch.
 *
 * `*.ap.brid.gy` is never excluded — those authors chose to bridge, and they
 * are squarely the sort of writing this reader is for.
 */

/** Tags stored as a topic's identity fingerprint and shown to the namer. */
const SIGNATURE_SIZE = 24;

/**
 * Quality bar for publishing a topic. Clusters below it keep their row
 * (so identity survives) but are hidden.
 */
/**
 * Smallest cluster worth publishing — a floor on substance, not a quota.
 *
 * How many topics exist is the network's answer, not a target: as the
 * corpus grows this number should grow with it. 14 is where a cluster stops
 * being a handful of tags and starts having real sub-areas to browse. (For
 * scale, on the corpus at time of writing it yields ~82; raising it to 16 would
 * give 69, to 22 would give 57 — the knob is here if the tail ever thins out.)
 */
const MIN_CLUSTER_TAGS = 14;
const MIN_CLUSTER_PUBLICATIONS = 10;
const MIN_CLUSTER_AUTHORS = 5;
/**
 * Largest share of a topic's publications one repo may account for.
 *
 * This is what separates a topic from a single operator's publication
 * fleet. The network's three highest-count tags (`chart`, `weekly`, `song` —
 * 700+ publications each) are one bot network auto-generating a publication per
 * user, all from **one DID**, and it clears every count-based threshold:
 * hundreds of publications, and — because tags that generic are also used
 * incidentally by real publications — enough distinct DIDs to pass an
 * author-*count* bar too (measured: 769 publications across 8 DIDs, of which
 * one DID is 99.5%). Concentration catches it where counting does not.
 */
const MAX_TOP_AUTHOR_SHARE = 0.5;

/**
 * How far a topic already published may slip before it is unlisted.
 *
 * The bars above are an *entry* test, and applying them unchanged every sweep
 * makes a topic sitting near one of them flap: published today, gone tomorrow,
 * back the day after. A URL that 404s on alternate days is worse than a topic
 * that is a little thin, and these are public links people share. So a topic
 * that has cleared the bar once keeps its place while it still clears this
 * fraction of it — real growth and decay move slowly, so only a topic that has
 * genuinely fallen apart drops out.
 */
const RETENTION_FACTOR = 0.7;
/** Concentration is the anti-fleet rule, so it slackens far less than the counts. */
const RETENTION_TOP_AUTHOR_SHARE = 0.6;
const RETENTION_BAR = {
  minTags: MIN_CLUSTER_TAGS * RETENTION_FACTOR,
  minPublications: MIN_CLUSTER_PUBLICATIONS * RETENTION_FACTOR,
  minAuthors: MIN_CLUSTER_AUTHORS * RETENTION_FACTOR,
  maxTopAuthorShare: RETENTION_TOP_AUTHOR_SHARE,
};

/**
 * Weakest overlap that still counts as "this topic became that one".
 *
 * Far below {@link IDENTITY_MATCH_SIMILARITY} by definition: anything at or
 * above that would have been matched as the *same* topic rather than a
 * successor. This is the looser question of where a reader who followed a link
 * to a dissolved topic should land, and a quarter of its tags surviving in one
 * place is a better answer than the index.
 */
const SUPERSEDE_SIMILARITY = 0.25;

/** Tag-set overlap at which a re-derived cluster is judged the same topic. */
const IDENTITY_MATCH_SIMILARITY = 0.5;
/** Below this overlap with its stored fingerprint, a topic is re-named. */
const RENAME_SIMILARITY = 0.8;

/** Rows per insert statement when writing tags and memberships. */
const INSERT_CHUNK = 500;

export interface TopicsRecomputeSummary {
  /** Tags that entered the graph. */
  tags: number;
  edges: number;
  semanticEdges: number;
  clusters: number;
  published: number;
  /** Clusters rejected by each condition, for tuning the bar from real data. */
  droppedByTags: number;
  droppedByPublications: number;
  droppedByAuthors: number;
  /** Rejected as one operator's publication fleet rather than a topic. */
  droppedByConcentration: number;
  /** Clusters sent to the naming model this sweep. */
  named: number;
}

/** Read rows off a drizzle `db.execute` result (array or `{ rows }`). */
function executeRows<T>(result: unknown): Array<T> {
  if (Array.isArray(result)) return result as Array<T>;
  return ((result as { rows?: Array<T> }).rows ?? []) as Array<T>;
}

interface EdgeRow {
  t1: string;
  t2: string;
  co: number;
  n1: number;
  n2: number;
}

interface MembershipRow {
  cluster_key: string;
  publication_uri: string;
  did: string;
  matched_tag_count: number;
  score: number;
  document_count: number;
}

interface Candidate {
  key: string;
  tags: Array<{ tag: string; weight: number }>;
  signature: Array<string>;
  publications: Array<{ uri: string; score: number; matchedTagCount: number }>;
  authorCount: number;
  /** Share of the cluster's publications owned by its single largest repo. */
  topAuthorShare: number;
  documentCount: number;
  published: boolean;
}

/**
 * Build the co-occurrence graph.
 *
 * Two tags are related when they appear on the same *article* — not merely
 * somewhere in the same publication, which would make every pair of topics a
 * wide-ranging publication covers look related.
 *
 * But the pair is counted **once per publisher, not once per article**, and
 * that distinction is what makes the clusters trustworthy. Counting articles
 * lets a single prolific author manufacture relatedness out of a personal
 * tagging habit: one fediverse-hosted music blog tagging every post
 * `fediverse` + `j-pop` produced 55 article-level co-occurrences, enough to
 * make `fediverse` the music cluster's 14th-strongest member. Counting
 * distinct publishers caps that blog's contribution at 1, and `fediverse`'s
 * neighbours become what you would expect — activitypub, mastodon, peertube,
 * pixelfed, indieweb — with `j-pop` falling from its strongest neighbour to
 * its eleventh.
 *
 * Loose documents (no publication row) count as their own publisher, since
 * each is an independent act rather than one author's repetition.
 *
 * Deliberately unfiltered — not by discover-eligibility and not by the bridge.
 * Which tags are related is a property of the whole corpus; *who gets shown* is
 * decided downstream, at membership and in the feed. Narrowing the graph to
 * what is displayable was tried and is much worse: see the bridge note above.
 */
async function selectEdges(): Promise<Array<EdgeRow>> {
  const result = await db.execute(sql`
    WITH vocab AS (
      SELECT topic
      FROM discover_topic_counts
      WHERE publication_count >= ${MIN_TAG_PUBLICATIONS}
        AND topic <> ALL (array[${sql.join(
          JUNK_TAGS.map((tag) => sql`${tag}`),
          sql`, `,
        )}])
        -- Structural junk: scraped emails and URLs, bare numbers or
        -- punctuation, and single ASCII letters. The character-class tests are
        -- written so they never catch a non-Latin tag — a one-character CJK
        -- topic is a real topic.
        AND topic NOT LIKE '%@%'
        AND topic !~* '^https?://'
        AND topic !~ '^[[:digit:][:punct:][:space:]]+$'
        AND topic !~* '^[a-z]$'
    ),
    doc_tag AS (
      -- Publishers, not documents: a loose document is its own publisher, so a
      -- bridged repo's thousands of posts cannot outvote anyone.
      SELECT DISTINCT d.uri,
                      coalesce(d.publication_uri, d.did) AS src,
                      lower(btrim(t)) AS tag
      FROM documents d
      LEFT JOIN publications p ON p.uri = d.publication_uri
      LEFT JOIN profiles ppr ON ppr.did = p.did
      LEFT JOIN profiles apr ON apr.did = d.did
      CROSS JOIN unnest(d.tags) AS t
      WHERE d.deleted = false AND btrim(t) <> ''
        -- Tested on the author, not just the publication: most bridged content
        -- has no publication row, so a publication-only test misses nearly all
        -- of it. A null handle is never treated as bridged — identity
        -- resolution fails for ordinary reasons, and dropping a real
        -- publisher's tags over a briefly unreachable DID document is worse.
    ),
    vocab_doc_tag AS (
      SELECT dt.uri, dt.src, dt.tag
      FROM doc_tag dt
      JOIN vocab v ON v.topic = dt.tag
    ),
    tag_df AS (
      SELECT tag, count(DISTINCT src)::int AS n FROM vocab_doc_tag GROUP BY tag
    ),
    pairs AS (
      SELECT a.tag AS t1, b.tag AS t2, count(DISTINCT a.src)::int AS co
      FROM vocab_doc_tag a
      JOIN vocab_doc_tag b ON b.uri = a.uri AND a.tag < b.tag
      GROUP BY 1, 2
      HAVING count(DISTINCT a.src) >= ${MIN_EDGE_PUBLISHERS}
    )
    SELECT p.t1, p.t2, p.co, d1.n AS n1, d2.n AS n2
    FROM pairs p
    JOIN tag_df d1 ON d1.tag = p.t1
    JOIN tag_df d2 ON d2.tag = p.t2
  `);
  return executeRows<EdgeRow>(result);
}

/**
 * Resolve each cluster's publications, authors, and document count in one pass.
 *
 * The tag→cluster mapping is handed to Postgres as a single JSON parameter
 * rather than a bound array: a JS array in a `sql` template binds as one scalar
 * value, which silently breaks array operators.
 */
async function selectMemberships(
  clusters: ReadonlyArray<{
    key: string;
    tags: Array<{ tag: string; weight: number }>;
  }>,
): Promise<Array<MembershipRow>> {
  const mapping = clusters.flatMap((cluster) =>
    cluster.tags.map((member) => ({
      k: cluster.key,
      t: member.tag,
      w: member.weight,
    })),
  );
  if (mapping.length === 0) return [];

  const result = await db.execute(sql`
    WITH mapping AS (
      SELECT m->>'k' AS cluster_key,
             m->>'t' AS tag,
             (m->>'w')::float8 AS weight
      FROM jsonb_array_elements(${JSON.stringify(mapping)}::jsonb) AS m
    ),
    doc_tag AS (
      SELECT DISTINCT d.uri AS doc_uri,
                      d.publication_uri,
                      p.did,
                      lower(btrim(t)) AS tag
      FROM documents d
      JOIN publications p ON p.uri = d.publication_uri
      LEFT JOIN profiles ppr ON ppr.did = p.did
      LEFT JOIN profiles apr ON apr.did = d.did
      CROSS JOIN unnest(d.tags) AS t
      WHERE d.deleted = false
        AND p.deleted = false
        AND p.show_in_discover = true
        AND p.url NOT ILIKE ${EXCLUDED_PUBLICATION_URL_PATTERN}
        AND (apr.handle IS NULL OR apr.handle NOT ILIKE ${WEB_BRIDGE_HANDLE_PATTERN})
        AND (ppr.handle IS NULL OR ppr.handle NOT ILIKE ${WEB_BRIDGE_HANDLE_PATTERN})
        AND btrim(t) <> ''
    ),
    matched AS (
      SELECT m.cluster_key, dt.doc_uri, dt.publication_uri, dt.did, dt.tag, m.weight
      FROM doc_tag dt
      JOIN mapping m ON m.tag = dt.tag
    ),
    pub_tag AS (
      SELECT DISTINCT cluster_key, publication_uri, did, tag, weight FROM matched
    ),
    pub_rows AS (
      SELECT cluster_key, publication_uri, did,
             count(*)::int AS matched_tag_count,
             sum(weight) AS score
      FROM pub_tag
      GROUP BY cluster_key, publication_uri, did
    ),
    doc_counts AS (
      SELECT cluster_key, count(DISTINCT doc_uri)::int AS document_count
      FROM matched
      GROUP BY cluster_key
    )
    SELECT pr.cluster_key, pr.publication_uri, pr.did,
           pr.matched_tag_count, pr.score, dc.document_count
    FROM pub_rows pr
    JOIN doc_counts dc ON dc.cluster_key = pr.cluster_key
  `);
  return executeRows<MembershipRow>(result);
}

/**
 * Match re-derived clusters onto existing topics so slugs (and therefore
 * URLs) survive the cluster shifting between sweeps.
 *
 * Greedy and one-to-one, largest cluster first: each candidate claims the
 * unclaimed topic its fingerprint overlaps most, provided the overlap
 * clears {@link IDENTITY_MATCH_SIMILARITY}. Everything else is a new topic.
 */
function matchIdentities(
  candidates: ReadonlyArray<Candidate>,
  existing: ReadonlyArray<{ slug: string; signatureTags: Array<string> }>,
): Map<string, string> {
  const claimed = new Set<string>();
  const matches = new Map<string, string>();

  for (const candidate of candidates) {
    let bestSlug: string | null = null;
    let bestScore = 0;
    for (const topic of existing) {
      if (claimed.has(topic.slug)) continue;
      const score = tagSetSimilarity(candidate.signature, topic.signatureTags);
      if (score < IDENTITY_MATCH_SIMILARITY) continue;
      // Ties break on slug so the outcome never depends on row order.
      if (
        bestSlug === null ||
        score > bestScore ||
        (score === bestScore && topic.slug < bestSlug)
      ) {
        bestScore = score;
        bestSlug = topic.slug;
      }
    }
    if (bestSlug) {
      claimed.add(bestSlug);
      matches.set(candidate.key, bestSlug);
    }
  }

  return matches;
}

/**
 * Put semantic edge weights on the co-occurrence scale.
 *
 * The two signals are both cosines but of completely different things, and
 * their ranges do not overlap: a strong behavioural edge sits around 0.1–0.3,
 * while every semantic edge is above the 0.72 similarity floor by construction.
 * Mixed raw, the semantic edges win every top-N neighbour cut and the graph
 * stops being behavioural at all — measured, that fragmented 56 topics
 * into 35 by turning co-occurrence structure into noise.
 *
 * So similarity is mapped onto the *observed* spread of co-occurrence weights:
 * the floor becomes a median behavioural edge, a perfect 1.0 becomes a strong
 * (p90) one. A semantic edge can then argue as loudly as real evidence, never
 * louder, and the mapping re-derives itself as the corpus moves.
 */
function rescaleToCooccurrence(
  semantic: ReadonlyArray<{ a: string; b: string; weight: number }>,
  cooccurrence: ReadonlyArray<{ weight: number }>,
): Array<{ a: string; b: string; weight: number }> {
  if (semantic.length === 0 || cooccurrence.length === 0) return [];

  const weights = cooccurrence
    .map((edge) => edge.weight)
    .toSorted((a, b) => a - b);
  const at = (quantile: number) =>
    weights[
      Math.min(weights.length - 1, Math.floor(weights.length * quantile))
    ] ?? 0;
  const low = at(0.5);
  const high = at(0.9);

  const minSimilarity = Math.min(...semantic.map((edge) => edge.weight));
  const span = Math.max(1e-6, 1 - minSimilarity);

  return semantic.map((edge) => ({
    a: edge.a,
    b: edge.b,
    weight:
      low + ((edge.weight - minSimilarity) / span) * Math.max(0, high - low),
  }));
}

/** What the derivation found, before naming or persistence. */
export interface TopicDerivation {
  candidates: Array<Candidate>;
  tags: number;
  edges: number;
  /** Extra edges contributed by embeddings; zero when the signal is off. */
  semanticEdges: number;
  clusters: number;
  droppedByTags: number;
  droppedByPublications: number;
  droppedByAuthors: number;
  droppedByConcentration: number;
  /**
   * Signatures of the clusters that never reached the membership query because
   * they were too small. Carried purely so the inspection script can show what
   * the tag bar is excluding — the sweep itself ignores this.
   */
  belowTagBar: Array<Array<string>>;
}

/**
 * Everything up to (but not including) naming and persistence: build the graph,
 * cluster it, resolve memberships, apply the quality bar.
 *
 * Split out so it can be run read-only — `scripts/derive-topics.mjs` uses
 * it to check cluster quality and the bar against real data without writing.
 */
export async function deriveTopics(): Promise<TopicDerivation> {
  const edgeRows = await selectEdges();
  const edges: Array<{ a: string; b: string; weight: number }> = edgeRows.map(
    (row) => ({
      a: row.t1,
      b: row.t2,
      weight: cosineWeight(row.co, row.n1, row.n2),
    }),
  );

  const tagCount = new Set(edgeRows.flatMap((row) => [row.t1, row.t2])).size;

  // Additive only: semantic edges join subjects whose publishers split (see
  // `./tag-embeddings`), and never remove or reweight a behavioural edge.
  let semanticEdges = 0;
  if (isTagEmbeddingEnabled()) {
    try {
      const vocabulary = [
        ...new Set(edgeRows.flatMap((row) => [row.t1, row.t2])),
      ].toSorted();
      const semantic = await semanticTagEdges(vocabulary);
      semanticEdges = semantic.length;
      edges.push(...rescaleToCooccurrence(semantic, edges));
    } catch {
      // A model that will not load must not take the sweep with it; the graph
      // is still complete without semantic edges, just more fragmented.
    }
  }

  const clusters = clusterTags(edges);

  // Only clusters that could clear a tag bar are worth resolving memberships
  // for — that query is the expensive one. The cut is at the *retention*
  // floor, not the entry floor, so a published topic that has shrunk a little
  // still reaches the hysteresis test below instead of vanishing here.
  const resolveMinTags = Math.floor(MIN_CLUSTER_TAGS * RETENTION_FACTOR);
  const sized = clusters
    .filter((cluster) => cluster.length >= resolveMinTags)
    .map((cluster, index) => ({ key: String(index), tags: cluster }));
  const droppedByTags = clusters.filter(
    (cluster) => cluster.length < MIN_CLUSTER_TAGS,
  ).length;
  const belowTagBar = clusters
    .filter((cluster) => cluster.length < MIN_CLUSTER_TAGS)
    .map((cluster) => cluster.map((member) => member.tag));

  const memberships = await selectMemberships(sized);

  const byCluster = new Map<
    string,
    {
      publications: Array<{
        uri: string;
        score: number;
        matchedTagCount: number;
      }>;
      publicationsByDid: Map<string, number>;
      documentCount: number;
    }
  >();
  for (const row of memberships) {
    let entry = byCluster.get(row.cluster_key);
    if (!entry) {
      entry = {
        publications: [],
        publicationsByDid: new Map(),
        documentCount: row.document_count,
      };
      byCluster.set(row.cluster_key, entry);
    }
    entry.publications.push({
      uri: row.publication_uri,
      score: Number(row.score),
      matchedTagCount: row.matched_tag_count,
    });
    entry.publicationsByDid.set(
      row.did,
      (entry.publicationsByDid.get(row.did) ?? 0) + 1,
    );
  }

  let droppedByPublications = 0;
  let droppedByAuthors = 0;
  let droppedByConcentration = 0;

  const candidates: Array<Candidate> = sized.map((cluster) => {
    const entry = byCluster.get(cluster.key);
    const publications = entry?.publications ?? [];
    const publicationsByDid =
      entry?.publicationsByDid ?? new Map<string, number>();
    const authorCount = publicationsByDid.size;
    const topAuthorPublications = Math.max(0, ...publicationsByDid.values());
    const topAuthorShare =
      publications.length === 0
        ? 1
        : topAuthorPublications / publications.length;
    publications.sort(
      (left, right) =>
        right.score - left.score ||
        (left.uri < right.uri ? -1 : left.uri > right.uri ? 1 : 0),
    );

    const enoughTags = cluster.tags.length >= MIN_CLUSTER_TAGS;
    const enoughPublications = publications.length >= MIN_CLUSTER_PUBLICATIONS;
    const enoughAuthors = authorCount >= MIN_CLUSTER_AUTHORS;
    const spreadAcrossAuthors = topAuthorShare <= MAX_TOP_AUTHOR_SHARE;
    // Below the tag bar is already counted in `droppedByTags`; counting it
    // again here would make the reasons sum to more than the rejections.
    if (!enoughTags) {
      // counted above
    } else if (!enoughPublications) droppedByPublications++;
    else if (!enoughAuthors) droppedByAuthors++;
    else if (!spreadAcrossAuthors) droppedByConcentration++;

    return {
      key: cluster.key,
      tags: cluster.tags,
      signature: cluster.tags
        .slice(0, SIGNATURE_SIZE)
        .map((member) => member.tag),
      publications,
      authorCount,
      topAuthorShare,
      documentCount: entry?.documentCount ?? 0,
      published:
        enoughTags &&
        enoughPublications &&
        enoughAuthors &&
        spreadAcrossAuthors,
    } satisfies Candidate;
  });

  return {
    candidates,
    tags: tagCount,
    edges: edges.length,
    semanticEdges,
    clusters: clusters.length,
    droppedByTags,
    droppedByPublications,
    droppedByAuthors,
    droppedByConcentration,
    belowTagBar,
  };
}

export async function recomputeTopics(): Promise<TopicsRecomputeSummary> {
  const derivation = await deriveTopics();
  const { candidates } = derivation;

  const existing = await db
    .select({
      slug: topics.slug,
      name: topics.name,
      description: topics.description,
      signatureTags: topics.signatureTags,
      nameModel: topics.nameModel,
      namedAt: topics.namedAt,
      published: topics.published,
    })
    .from(topics);
  const existingBySlug = new Map(existing.map((row) => [row.slug, row]));

  const matches = matchIdentities(candidates, existing);

  // Name only what needs it: a brand-new cluster, one whose fingerprint drifted
  // far enough that its old name may no longer fit, or one still carrying the
  // deterministic fallback name from a sweep that ran without naming.
  const namingConfigured = isTopicNamingConfigured();
  const needsNaming = candidates.filter((candidate) => {
    const slug = matches.get(candidate.key);
    const prior = slug ? existingBySlug.get(slug) : undefined;
    if (!prior) return true;
    if (namingConfigured && !prior.nameModel) return true;
    return (
      tagSetSimilarity(candidate.signature, prior.signatureTags) <
      RENAME_SIMILARITY
    );
  });

  const namings = await nameTopics(
    needsNaming.map((candidate) => candidate.signature),
  );
  const namingByKey = new Map(
    needsNaming.map((candidate, index) => [
      candidate.key,
      namings[index] ?? fallbackTopicName(candidate.signature),
    ]),
  );

  // Assign slugs. Existing topics keep theirs; new ones mint from the name
  // and must not collide with any slug already in the table.
  const takenSlugs = new Set(existing.map((row) => row.slug));
  const resolved = candidates.map((candidate) => {
    const matchedSlug = matches.get(candidate.key);
    const prior = matchedSlug ? existingBySlug.get(matchedSlug) : undefined;
    const naming = namingByKey.get(candidate.key);
    const name =
      naming?.name ??
      prior?.name ??
      fallbackTopicName(candidate.signature).name;
    const description = naming
      ? naming.description
      : (prior?.description ?? null);
    const nameModel = naming ? naming.model : (prior?.nameModel ?? null);
    const namedAt = naming ? new Date() : (prior?.namedAt ?? null);

    const slug =
      matchedSlug ?? topicSlug(name, candidate.signature.join(" "), takenSlugs);
    takenSlugs.add(slug);

    // Hysteresis: a topic that has already been published keeps its place
    // while it still clears the retention bar, so a marginal sweep does not
    // take a live URL off the site. See RETENTION_FACTOR.
    const published =
      candidate.published ||
      (prior?.published === true &&
        clearsRetentionBar(
          {
            tagCount: candidate.tags.length,
            publicationCount: candidate.publications.length,
            authorCount: candidate.authorCount,
            topAuthorShare: candidate.topAuthorShare,
          },
          RETENTION_BAR,
        ));

    return {
      candidate,
      published,
      slug,
      name,
      description,
      nameModel,
      namedAt,
    };
  });

  const publishedSlugs = resolved
    .filter((row) => row.published)
    .map((row) => row.slug);
  const successors = findSuccessors(
    resolved.map((row) => ({
      slug: row.slug,
      published: row.published,
      signature: row.candidate.signature,
    })),
    existing,
    SUPERSEDE_SIMILARITY,
  );

  await db.transaction(async (tx) => {
    // One statement rather than a loop: the ingest worker and the database sit
    // in different regions, so a per-topic round trip would dominate the
    // pass's wall clock.
    for (const batch of chunk(resolved, INSERT_CHUNK)) {
      await tx
        .insert(topics)
        .values(
          batch.map((row) => ({
            slug: row.slug,
            name: row.name,
            description: row.description,
            signatureTags: row.candidate.signature,
            tagCount: row.candidate.tags.length,
            publicationCount: row.candidate.publications.length,
            authorCount: row.candidate.authorCount,
            documentCount: row.candidate.documentCount,
            // Distinct writers, not publications: what makes a topic worth
            // showing is how many people are in it. The Discover rail rotates
            // over a wider pool on top of this, so a fixed ranking here does
            // not mean a fixed rail.
            score: row.candidate.authorCount,
            published: row.published,
            nameModel: row.nameModel,
            namedAt: row.namedAt,
          })),
        )
        .onConflictDoUpdate({
          target: topics.slug,
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            signatureTags: sql`excluded.signature_tags`,
            tagCount: sql`excluded.tag_count`,
            publicationCount: sql`excluded.publication_count`,
            authorCount: sql`excluded.author_count`,
            documentCount: sql`excluded.document_count`,
            score: sql`excluded.score`,
            published: sql`excluded.published`,
            nameModel: sql`excluded.name_model`,
            namedAt: sql`excluded.named_at`,
            updatedAt: sql`now()`,
          },
        });
    }

    // Anything not published this sweep is hidden rather than deleted, so a
    // topic that dips below the bar and comes back keeps its URL.
    await tx
      .update(topics)
      .set({ published: false, updatedAt: new Date() })
      .where(
        publishedSlugs.length === 0
          ? eq(topics.published, true)
          : and(
              eq(topics.published, true),
              notInArray(topics.slug, publishedSlugs),
            ),
      );

    // Point every unpublished topic at its closest surviving neighbour, so its
    // URL redirects instead of 404ing. Recomputed each sweep rather than
    // written once: the successor may itself be unpublished later, and pointing
    // at whatever is closest *today* keeps the chain short.
    for (const [slug, target] of successors) {
      await tx
        .update(topics)
        .set({ supersededBy: target, updatedAt: new Date() })
        .where(eq(topics.slug, slug));
    }

    // Tags and memberships are stored for published topics only — the
    // read path never asks for them otherwise, and the below-bar tail is a few
    // hundred clusters wide.
    await tx.execute(sql`DELETE FROM topic_tags`);
    await tx.execute(sql`DELETE FROM topic_publications`);

    const tagValues = resolved
      .filter((row) => row.published)
      .flatMap((row) =>
        row.candidate.tags.map((member) => ({
          topicSlug: row.slug,
          tag: member.tag,
          weight: member.weight,
        })),
      );
    for (const batch of chunk(tagValues, INSERT_CHUNK)) {
      await tx.insert(topicTags).values(batch);
    }

    const publicationValues = resolved
      .filter((row) => row.published)
      .flatMap((row) =>
        row.candidate.publications.map((publication) => ({
          topicSlug: row.slug,
          publicationUri: publication.uri,
          score: publication.score,
          matchedTagCount: publication.matchedTagCount,
        })),
      );
    for (const batch of chunk(publicationValues, INSERT_CHUNK)) {
      await tx.insert(topicPublications).values(batch);
    }
  });

  const summary: TopicsRecomputeSummary = {
    tags: derivation.tags,
    edges: derivation.edges,
    semanticEdges: derivation.semanticEdges,
    clusters: derivation.clusters,
    published: publishedSlugs.length,
    droppedByTags: derivation.droppedByTags,
    droppedByPublications: derivation.droppedByPublications,
    droppedByAuthors: derivation.droppedByAuthors,
    droppedByConcentration: derivation.droppedByConcentration,
    named: needsNaming.length,
  };
  logEvent("ingest.recomputeTopics", { ...summary });
  return summary;
}
