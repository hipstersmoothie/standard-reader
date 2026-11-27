/**
 * Keeping the published topic set free of duplicates.
 *
 * Clustering partitions the tag graph, so two *fresh* clusters never share a
 * tag — but the published set is not just fresh clusters. Carry-forward keeps
 * a topic on its old tags when the clustering reshuffles, and the reshuffled
 * cluster that replaced it publishes beside it under a new slug. Nothing ever
 * reconciled the two, so the set ratcheted: by November 2026 the site carried
 * **830** published topics, **523** of them carried forward, with 68 names
 * used more than once (`Video Games` twenty times) and, for 694 topics, another
 * topic containing ≥80% of its publications. AI alone had 61 topics.
 *
 * Two topics are the same page to a reader when the smaller one's articles are
 * mostly the larger one's articles, so that is what this measures — shared feed
 * documents over the smaller feed — with tag-set containment as a second,
 * cheaper route to the same verdict for topics whose feeds are thin.
 *
 * Pure and database-free, like `./topic-succession`, so it can be tested
 * without `recompute-topics.ts` opening a connection at import time.
 */

/** A published topic as the dedupe pass sees it. */
export interface DedupeTopic {
  key: string;
  /** Every member tag, normalized. */
  tags: ReadonlyArray<string>;
  /** Distinct member writers — the topic's reach. */
  authorCount: number;
  /** Distinct feed documents, i.e. what its Articles tab would list. */
  documentCount: number;
  /**
   * Published before this sweep. An established topic has a public URL, so
   * it is harder to displace — see {@link DedupeThresholds.establishedAdvantage}.
   */
  established: boolean;
}

export interface DedupeThresholds {
  /**
   * Share of the smaller topic's feed documents that must also be in the
   * larger's for the two to be one topic.
   */
  minDocumentOverlap: number;
  /** Share of the smaller topic's tags the larger must contain. */
  minTagOverlap: number;
  /**
   * Reach multiplier for topics that were already published.
   *
   * Without it, two near-equal duplicates trade places whenever their author
   * counts wobble, and each swap unpublishes a live URL. With it, a new
   * cluster has to be clearly bigger to take over an existing topic's area.
   */
  establishedAdvantage: number;
}

/**
 * Overlap coefficient: shared members over the smaller set.
 *
 * Deliberately not Jaccard. A narrow topic sitting wholly inside a broad one
 * scores low on Jaccard (the size gap dominates) but is still a duplicate page
 * — everything it lists, the broad topic lists too.
 */
export function overlapCoefficient(
  left: Iterable<string>,
  right: Iterable<string>,
): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const smaller = Math.min(leftSet.size, rightSet.size);
  if (smaller === 0) return 0;
  let shared = 0;
  for (const tag of leftSet) {
    if (rightSet.has(tag)) shared++;
  }
  return shared / smaller;
}

/** Order-independent key for a pair of topics. */
export function pairKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

/** Ranking used to choose which of two duplicates survives. Best first. */
export function compareSurvivors(
  left: DedupeTopic,
  right: DedupeTopic,
  establishedAdvantage: number,
): number {
  const reach = (topic: DedupeTopic) =>
    topic.authorCount * (topic.established ? establishedAdvantage : 1);
  return (
    reach(right) - reach(left) ||
    Number(right.established) - Number(left.established) ||
    right.documentCount - left.documentCount ||
    (left.key < right.key ? -1 : left.key > right.key ? 1 : 0)
  );
}

/**
 * How much of the smaller topic the larger already covers, on whichever
 * measure says more. Zero when neither clears its threshold.
 */
function duplicateScore(
  left: DedupeTopic,
  right: DedupeTopic,
  sharedDocuments: number,
  thresholds: DedupeThresholds,
): number {
  const smallerFeed = Math.min(left.documentCount, right.documentCount);
  const documentOverlap =
    smallerFeed > 0 ? Math.min(1, sharedDocuments / smallerFeed) : 0;
  const tagOverlap = overlapCoefficient(left.tags, right.tags);
  return Math.max(
    documentOverlap >= thresholds.minDocumentOverlap ? documentOverlap : 0,
    tagOverlap >= thresholds.minTagOverlap ? tagOverlap : 0,
  );
}

/**
 * Collapse near-duplicate topics into their strongest representative.
 *
 * Greedy, best topic first: each topic either joins the kept set or, if it
 * duplicates a topic already kept, is absorbed into the one it overlaps most.
 * Comparing only against *kept* topics keeps it one-hop — an absorbed topic
 * never absorbs anything — so every redirect lands on a published page.
 *
 * Returns absorbed key → survivor key. Topics not in the map survive.
 *
 * `sharedDocuments` answers "how many feed documents do these two share";
 * pairs it has no figure for are treated as sharing none, so the caller only
 * has to supply the pairs that could matter.
 */
export function dedupeTopics(
  topics: ReadonlyArray<DedupeTopic>,
  sharedDocuments: ReadonlyMap<string, number>,
  thresholds: DedupeThresholds,
): Map<string, string> {
  const ordered = topics.toSorted((left, right) =>
    compareSurvivors(left, right, thresholds.establishedAdvantage),
  );

  const kept: Array<DedupeTopic> = [];
  const absorbed = new Map<string, string>();

  for (const topic of ordered) {
    let best: DedupeTopic | null = null;
    let bestScore = 0;
    for (const survivor of kept) {
      const score = duplicateScore(
        topic,
        survivor,
        sharedDocuments.get(pairKey(topic.key, survivor.key)) ?? 0,
        thresholds,
      );
      // Strictly greater: on a tie the earlier (stronger) survivor wins.
      if (score > bestScore) {
        best = survivor;
        bestScore = score;
      }
    }
    if (best) absorbed.set(topic.key, best.key);
    else kept.push(topic);
  }

  return absorbed;
}

/** Name as a reader compares names: case, accents and punctuation ignored. */
export function normalizeTopicName(name: string): string {
  return name
    .normalize("NFKD")
    .replaceAll(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Merge published topics that ended up with the same name.
 *
 * The namer sees one cluster at a time, so two fragments of one subject — a
 * clustering that split the games vocabulary by franchise, say — both come back
 * as "Video Games". A reader cannot tell those apart however different their
 * tag sets are, so a shared name is treated as the duplicate it reads as: the
 * stronger topic keeps the name and the URL, the other redirects to it.
 */
export function dedupeByName(
  topics: ReadonlyArray<DedupeTopic & { name: string }>,
  establishedAdvantage: number,
): Map<string, string> {
  const ordered = topics.toSorted((left, right) =>
    compareSurvivors(left, right, establishedAdvantage),
  );
  const ownerByName = new Map<string, string>();
  const absorbed = new Map<string, string>();
  for (const topic of ordered) {
    const name = normalizeTopicName(topic.name);
    if (!name) continue;
    const owner = ownerByName.get(name);
    if (owner) absorbed.set(topic.key, owner);
    else ownerByName.set(name, topic.key);
  }
  return absorbed;
}
