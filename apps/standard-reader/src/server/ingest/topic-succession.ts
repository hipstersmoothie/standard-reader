/**
 * What happens to a topic that stops clearing the quality bar.
 *
 * Two rules, both about not breaking URLs, kept here rather than in
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
