/**
 * What happens to a topic that stops clearing the quality bar — or that stops
 * being re-derived at all.
 *
 * Three rules, all about not breaking URLs, kept here rather than in
 * `recompute-topics.ts` so they are testable without a database — that module
 * opens a connection at import time. The *policy* (which numbers) stays with
 * the quality bar it belongs to; this module owns only the logic.
 */

import { tagSetSimilarity } from "./tag-clustering.ts";

/** The four measurements the quality bar is expressed in. */
export interface TopicShape {
  tagCount: number;
  publicationCount: number;
  authorCount: number;
  /** Share of the topic's publications belonging to its largest single repo. */
  topAuthorShare: number;
}

export interface RetentionThresholds {
  minTags: number;
  minPublications: number;
  minAuthors: number;
  maxTopAuthorShare: number;
}

export interface EntryThresholds {
  minTags: number;
  minPublications: number;
  minAuthors: number;
  maxTopAuthorShare: number;
  /** Tag floor for a cluster that clears {@link reachWaiverAuthors}. */
  absoluteMinTags: number;
  /** Authors at which the short-cluster floor replaces `minTags`. */
  reachWaiverAuthors: number;
}

/**
 * Whether a cluster is substantial enough to publish for the first time.
 *
 * The tag floor is a proxy for substance, and it measures *vocabulary breadth*.
 * That proxy breaks for a subject the network writes about with one dominant
 * tag rather than a rich vocabulary — the photography cluster carries 65
 * publications and 64 authors on 12 tags, more reach than most topics already
 * on the site, and was rejected for the two tags it lacked.
 *
 * So reach is allowed to stand in for breadth: a cluster shorter than
 * `minTags` still qualifies if enough separate writers are behind it, down to
 * `absoluteMinTags` — below which a topic page has no sub-areas to show,
 * however many people are in it. Every other test applies unchanged; in
 * particular the concentration rule still catches single-operator fleets,
 * which is what stops "lots of authors" from becoming a loophole.
 */
export function clearsEntryBar(
  topic: TopicShape,
  thresholds: EntryThresholds,
): boolean {
  const enoughTags =
    topic.tagCount >= thresholds.minTags ||
    (topic.tagCount >= thresholds.absoluteMinTags &&
      topic.authorCount >= thresholds.reachWaiverAuthors);

  return (
    enoughTags &&
    topic.publicationCount >= thresholds.minPublications &&
    topic.authorCount >= thresholds.minAuthors &&
    topic.topAuthorShare <= thresholds.maxTopAuthorShare
  );
}

/**
 * Whether an already-published topic is still substantial enough to stay up.
 *
 * Deliberately the same three signals as the entry bar rather than a separate
 * rule, so there is one definition of "a real topic" and only its strictness
 * changes. A topic that fails this has not dipped — it has dissolved.
 */
export function clearsRetentionBar(
  topic: TopicShape,
  thresholds: RetentionThresholds,
): boolean {
  return (
    topic.tagCount >= thresholds.minTags &&
    topic.publicationCount >= thresholds.minPublications &&
    topic.authorCount >= thresholds.minAuthors &&
    topic.topAuthorShare <= thresholds.maxTopAuthorShare
  );
}

/**
 * Share of a topic's own tags that a cluster already contains.
 *
 * Deliberately asymmetric, unlike the Jaccard used for identity and
 * succession. The question here is only "has this cluster absorbed the topic",
 * and Jaccard answers a different one — it punishes the size gap, so a broad
 * topic and a narrow cluster carved out of it score low in *both* directions
 * even though one plainly sits inside the other. Containment reads the two
 * cases apart: a 14-tag fragment of a 65-tag topic covers 0.22 of it (not a
 * replacement), while a re-derived near-duplicate covers 0.9 (is one).
 */
export function tagSetCoverage(
  topic: Iterable<string>,
  cluster: Iterable<string>,
): number {
  const topicTags = new Set(topic);
  if (topicTags.size === 0) return 0;
  const clusterTags = new Set(cluster);
  let shared = 0;
  for (const tag of topicTags) {
    if (clusterTags.has(tag)) shared++;
  }
  return shared / topicTags.size;
}

/**
 * Whether a published topic that no cluster re-derived should be measured on
 * its own tags rather than dropped.
 *
 * Clustering is not stable between sweeps — label propagation reshuffles as
 * the corpus moves, and a topic can lose its cluster while every tag in it is
 * still a live subject with publications behind it. Dropping on that signal
 * alone is what took a 24-tag, 84-publication TV topic off the site because a
 * 14-tag Daredevil cluster formed in its place; the entry bar would have
 * passed the TV topic three times over.
 *
 * So the sweep re-measures instead. The only reason not to is that some
 * cluster published this sweep has already absorbed the topic, in which case
 * carrying it forward would put a near-duplicate of that cluster on the site.
 * A narrower cluster carved out of the topic is not an absorption — both are
 * real, at different altitudes, and both should exist.
 */
export function shouldCarryForward(
  topicTags: Iterable<string>,
  publishedClusters: ReadonlyArray<Array<string>>,
  maxCoverage: number,
): boolean {
  const tags = [...topicTags];
  if (tags.length === 0) return false;
  return publishedClusters.every(
    (cluster) => tagSetCoverage(tags, cluster) < maxCoverage,
  );
}

/** A topic as this sweep resolved it. */
export interface ResolvedTopic {
  slug: string;
  published: boolean;
  /** The cluster's fingerprint *this* sweep. */
  signature: Array<string>;
}

/** A topic as the previous sweep left it in the database. */
export interface StoredTopic {
  slug: string;
  signatureTags: Array<string>;
}

/**
 * Where each unpublished topic's URL should now point.
 *
 * Two ways a topic ends up here, and they need different fingerprints:
 *
 * - **It dissolved.** No cluster matched it this sweep, so there is no fresh
 *   signature — compare its *stored* one, which is the last thing it was.
 * - **It fell below the bar.** It still has a cluster, so compare the fresh
 *   signature; that is what it looks like now.
 *
 * Either way the answer is the published topic sharing the most tags with it.
 * `minSimilarity` is the floor below which "closest" stops meaning "related";
 * mapping those to null is deliberate, because the route sends them to the
 * index, which is honest, rather than to an unrelated topic.
 *
 * Necessarily far below the identity-match threshold: anything that similar
 * would have been matched as the *same* topic rather than a successor.
 */
export function findSuccessors(
  resolved: Array<ResolvedTopic>,
  stored: Array<StoredTopic>,
  minSimilarity: number,
): Map<string, string | null> {
  const successors = new Map<string, string | null>();
  const targets = resolved.filter((topic) => topic.published);
  if (targets.length === 0) return successors;

  const published = new Set(targets.map((topic) => topic.slug));

  const fingerprints = new Map<string, Array<string>>();
  for (const topic of stored) fingerprints.set(topic.slug, topic.signatureTags);
  // A resolved topic's fresh signature beats whatever it was last sweep.
  for (const topic of resolved) fingerprints.set(topic.slug, topic.signature);

  for (const [slug, signature] of fingerprints) {
    if (published.has(slug)) continue;

    let best: string | null = null;
    let bestScore = -1;
    for (const target of targets) {
      const score = tagSetSimilarity(signature, target.signature);
      if (score < minSimilarity) continue;
      // Ties break on slug so a sweep that changes nothing rewrites nothing.
      const better =
        score > bestScore ||
        (best !== null && score === bestScore && target.slug < best);
      if (better) {
        best = target.slug;
        bestScore = score;
      }
    }
    successors.set(slug, best);
  }

  return successors;
}
