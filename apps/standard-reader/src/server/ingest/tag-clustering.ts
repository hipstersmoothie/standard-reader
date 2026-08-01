/**
 * Tag clustering for auto-derived topics.
 *
 * Topics are found by clustering the tag co-occurrence graph: two tags are
 * related when they appear on the same *document* (not merely somewhere in the
 * same publication — a publication that covers both Spanish politics and New
 * York does not make those two topics related, and publication-level
 * co-occurrence produces exactly that kind of false edge).
 *
 * The clustering is weighted asynchronous label propagation. It is chosen over
 * a fixed-K method because the number of real topics on the network is
 * unknown and grows, and over naive connected components because any single
 * threshold either fuses the whole graph into one blob or shatters it into
 * hundreds of pairs — label propagation finds mid-scale structure on its own.
 *
 * Determinism is a hard requirement, not a nicety: the sweep runs hourly and a
 * topic's identity (and therefore its URL) is matched across sweeps by tag
 * overlap. Randomized iteration order would reshuffle clusters every hour and
 * churn identities, so visitation is sorted and every tie is broken by label.
 *
 * Pure and side-effect free — see `recompute-topics.ts` for the SQL that
 * builds the graph and the persistence around it.
 */

/** How many strongest neighbours each tag keeps after sparsification. */
export const DEFAULT_NEIGHBOR_LIMIT = 12;
/** Weakest edge weight worth keeping (cosine). Below this is coincidence. */
export const DEFAULT_MIN_WEIGHT = 0.02;
/** Safety bound on propagation passes; real graphs converge in well under this. */
export const DEFAULT_MAX_ITERATIONS = 15;
/**
 * Above this many tags a cluster is treated as a blob and re-split rather than
 * published as one topic. Nothing coherent needs this many sub-areas.
 */
export const DEFAULT_MAX_CLUSTER_TAGS = 150;
/** How many times an oversized cluster may be re-split before it is accepted. */
export const DEFAULT_SPLIT_DEPTH = 2;
/** How much the weight floor rises when re-splitting an oversized cluster. */
const SPLIT_WEIGHT_MULTIPLIER = 2;

/** One undirected edge of the co-occurrence graph. */
export interface TagEdge {
  a: string;
  b: string;
  /** Similarity in (0, 1]; see {@link cosineWeight}. */
  weight: number;
}

/** A tag and how central it is to the cluster it landed in. */
export interface ClusteredTag {
  tag: string;
  /** Summed weight of this tag's edges to other members of its own cluster. */
  weight: number;
}

export interface ClusterTagsOptions {
  neighborLimit?: number;
  minWeight?: number;
  maxIterations?: number;
  /** Re-split clusters larger than this. Zero or less disables splitting. */
  maxClusterTags?: number;
  /** Remaining re-split attempts. Zero accepts oversized clusters as they are. */
  splitDepth?: number;
}

/**
 * Cosine similarity of two tags from their co-occurrence counts.
 *
 * `co / sqrt(n1 * n2)` rather than raw `co` or Jaccard: raw counts let a single
 * high-frequency tag dominate every edge it touches, and Jaccard over-penalizes
 * a genuinely broad tag (`politics`) pairing with a narrow one (`marco rubio`).
 */
export function cosineWeight(co: number, n1: number, n2: number): number {
  if (co <= 0 || n1 <= 0 || n2 <= 0) return 0;
  return co / Math.sqrt(n1 * n2);
}

/**
 * Adjacency map, sparsified to each tag's strongest `neighborLimit` neighbours
 * above `minWeight`.
 *
 * Sparsification is what stops hub tags from fusing unrelated clusters: a tag
 * like `news` has a weak edge to nearly everything, and left in place those
 * edges carry enough summed weight to drag whole clusters together.
 */
function buildAdjacency(
  edges: ReadonlyArray<TagEdge>,
  neighborLimit: number,
  minWeight: number,
): Map<string, Array<[string, number]>> {
  const adjacency = new Map<string, Array<[string, number]>>();
  const push = (from: string, to: string, weight: number) => {
    const existing = adjacency.get(from);
    if (existing) existing.push([to, weight]);
    else adjacency.set(from, [[to, weight]]);
  };

  for (const edge of edges) {
    if (edge.a === edge.b) continue;
    if (!(edge.weight >= minWeight)) continue;
    push(edge.a, edge.b, edge.weight);
    push(edge.b, edge.a, edge.weight);
  }

  for (const [tag, neighbors] of adjacency) {
    neighbors.sort(
      (left, right) =>
        right[1] - left[1] ||
        (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0),
    );
    if (neighbors.length > neighborLimit) {
      adjacency.set(tag, neighbors.slice(0, neighborLimit));
    }
  }

  return adjacency;
}

/**
 * One pass of weighted label propagation.
 *
 * Every tag starts as its own label, then repeatedly adopts the label carrying
 * the most edge weight among its neighbours. Returns clusters ordered largest
 * first, each with its members ordered most-central first. Isolated tags (no
 * surviving edges) are dropped — a cluster of one is not a topic.
 */
function propagate(
  edges: ReadonlyArray<TagEdge>,
  neighborLimit: number,
  minWeight: number,
  maxIterations: number,
): Array<Array<ClusteredTag>> {
  const adjacency = buildAdjacency(edges, neighborLimit, minWeight);
  // Sorted visitation order — the whole algorithm's determinism rests on this.
  const order = [...adjacency.keys()].toSorted();
  const labels = new Map(order.map((tag) => [tag, tag]));

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let changed = 0;
    for (const tag of order) {
      const neighbors = adjacency.get(tag);
      if (!neighbors || neighbors.length === 0) continue;

      const scores = new Map<string, number>();
      for (const [neighbor, weight] of neighbors) {
        const label = labels.get(neighbor);
        if (label === undefined) continue;
        scores.set(label, (scores.get(label) ?? 0) + weight);
      }
      if (scores.size === 0) continue;

      // Heaviest label wins; ties go to the lexicographically smaller label so
      // the outcome never depends on Map insertion order.
      let best = labels.get(tag) as string;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const [label, score] of scores) {
        if (score > bestScore || (score === bestScore && label < best)) {
          best = label;
          bestScore = score;
        }
      }
      if (best !== labels.get(tag)) {
        labels.set(tag, best);
        changed++;
      }
    }
    if (changed === 0) break;
  }

  const members = new Map<string, Array<string>>();
  for (const tag of order) {
    const label = labels.get(tag) as string;
    const existing = members.get(label);
    if (existing) existing.push(tag);
    else members.set(label, [tag]);
  }

  const clusters: Array<Array<ClusteredTag>> = [];
  for (const tags of members.values()) {
    if (tags.length < 2) continue;
    const memberSet = new Set(tags);
    const scored = tags.map((tag) => {
      let weight = 0;
      for (const [neighbor, edgeWeight] of adjacency.get(tag) ?? []) {
        if (memberSet.has(neighbor)) weight += edgeWeight;
      }
      return { tag, weight };
    });
    scored.sort(
      (left, right) =>
        right.weight - left.weight ||
        (left.tag < right.tag ? -1 : left.tag > right.tag ? 1 : 0),
    );
    clusters.push(scored);
  }

  return sortClusters(clusters);
}

/** Largest first, ties broken on the head tag so the order is deterministic. */
function sortClusters(
  clusters: Array<Array<ClusteredTag>>,
): Array<Array<ClusteredTag>> {
  return clusters.toSorted((left, right) => {
    if (right.length !== left.length) return right.length - left.length;
    // Every cluster has at least two members, so the head always exists.
    const leftHead = left[0]?.tag ?? "";
    const rightHead = right[0]?.tag ?? "";
    return leftHead < rightHead ? -1 : leftHead > rightHead ? 1 : 0;
  });
}

/**
 * Group tags into clusters, splitting any cluster that grows into a blob.
 *
 * Label propagation has no size control, and on a real corpus it produces one
 * or two enormous clusters alongside the good ones — a 429-tag "topic" that
 * had absorbed musicians, actors and junk tags is what prompted this. Those are
 * not topics; they are what is left when weak edges chain everything together.
 *
 * The fix is to re-run propagation on the oversized cluster alone, with the
 * graph tightened (fewer neighbours kept, a higher weight floor). Within the
 * blob the weak bridges that chained it are exactly what the tighter cut
 * removes, so the real sub-topics fall out. Tags too weakly attached to
 * survive the tighter cut are dropped — they were the noise holding the blob
 * together. A split that fails to divide is discarded and the original kept, so
 * this can only ever improve the shape.
 */
export function clusterTags(
  edges: ReadonlyArray<TagEdge>,
  options: ClusterTagsOptions = {},
): Array<Array<ClusteredTag>> {
  const {
    neighborLimit = DEFAULT_NEIGHBOR_LIMIT,
    minWeight = DEFAULT_MIN_WEIGHT,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    maxClusterTags = DEFAULT_MAX_CLUSTER_TAGS,
    splitDepth = DEFAULT_SPLIT_DEPTH,
  } = options;

  const clusters = propagate(edges, neighborLimit, minWeight, maxIterations);
  if (splitDepth <= 0 || maxClusterTags <= 0) return clusters;

  const out: Array<Array<ClusteredTag>> = [];
  for (const cluster of clusters) {
    if (cluster.length <= maxClusterTags) {
      out.push(cluster);
      continue;
    }

    const members = new Set(cluster.map((member) => member.tag));
    const induced = edges.filter(
      (edge) => members.has(edge.a) && members.has(edge.b),
    );
    const split = clusterTags(induced, {
      neighborLimit: Math.max(3, Math.floor(neighborLimit / 2)),
      minWeight: minWeight * SPLIT_WEIGHT_MULTIPLIER,
      maxIterations,
      maxClusterTags,
      splitDepth: splitDepth - 1,
    });

    if (split.length > 1) out.push(...split);
    else out.push(cluster);
  }

  return sortClusters(out);
}

/**
 * Jaccard similarity of two tag sets — how a re-derived cluster is matched back
 * onto an existing topic so its slug (and URL) survives.
 */
export function tagSetSimilarity(
  left: Iterable<string>,
  right: Iterable<string>,
): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let shared = 0;
  for (const tag of leftSet) {
    if (rightSet.has(tag)) shared++;
  }
  const union = leftSet.size + rightSet.size - shared;
  return union === 0 ? 0 : shared / union;
}
