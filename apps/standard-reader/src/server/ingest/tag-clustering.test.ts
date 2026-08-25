import { describe, expect, it } from "vitest";

import { clusterTags, cosineWeight, tagSetSimilarity } from "./tag-clustering";
import type { TagEdge } from "./tag-clustering";

/** Fully connect a set of tags at a given weight. */
function clique(tags: Array<string>, weight: number): Array<TagEdge> {
  const edges: Array<TagEdge> = [];
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      edges.push({ a: tags[i] as string, b: tags[j] as string, weight });
    }
  }
  return edges;
}

/** Connect tags in a loop — a sparse group, unlike a clique. */
function ring(tags: Array<string>, weight: number): Array<TagEdge> {
  return tags.map((tag, index) => ({
    a: tag,
    b: tags[(index + 1) % tags.length] as string,
    weight,
  }));
}

const GAMING = ["ps5", "xbox", "nintendo switch", "rpg", "video games"];
const MUSIC = ["k-pop", "vinyl", "jazz", "hip hop", "album"];

function tagsOf(cluster: Array<{ tag: string }>): Array<string> {
  return cluster.map((member) => member.tag).toSorted();
}

describe("cosineWeight", () => {
  it("normalizes co-occurrence by both tags' frequencies", () => {
    // Same co-occurrence count, but the second pair is far more common overall,
    // so the shared documents mean less.
    expect(cosineWeight(10, 10, 10)).toBe(1);
    expect(cosineWeight(10, 1000, 1000)).toBeCloseTo(0.01);
  });

  it("is zero for degenerate inputs", () => {
    expect(cosineWeight(0, 10, 10)).toBe(0);
    expect(cosineWeight(5, 0, 10)).toBe(0);
  });
});

describe("clusterTags", () => {
  it("separates two dense groups joined by one weak edge", () => {
    const edges = [
      ...clique(GAMING, 0.5),
      ...clique(MUSIC, 0.5),
      // A single incidental co-occurrence must not fuse them.
      { a: "rpg", b: "album", weight: 0.03 },
    ];

    const clusters = clusterTags(edges);

    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => tagsOf(c)).toSorted()).toEqual(
      [[...GAMING].toSorted(), [...MUSIC].toSorted()].toSorted(),
    );
  });

  it("does not let a weak hub tag fuse unrelated clusters", () => {
    // `news` touches everything faintly — exactly the shape that collapses a
    // co-occurrence graph into one blob without sparsification.
    const hub: Array<TagEdge> = [...GAMING, ...MUSIC].map((tag) => ({
      a: "news",
      b: tag,
      weight: 0.05,
    }));
    const edges = [...clique(GAMING, 0.5), ...clique(MUSIC, 0.5), ...hub];

    const clusters = clusterTags(edges);

    const gaming = clusters.find((cluster) =>
      cluster.some((member) => member.tag === "ps5"),
    );
    const music = clusters.find((cluster) =>
      cluster.some((member) => member.tag === "jazz"),
    );
    expect(gaming).toBeDefined();
    expect(music).toBeDefined();
    expect(gaming).not.toBe(music);
  });

  it("drops edges below the weight floor", () => {
    const clusters = clusterTags([
      ...clique(GAMING, 0.5),
      { a: "unrelated-a", b: "unrelated-b", weight: 0.001 },
    ]);

    expect(clusters).toHaveLength(1);
    expect(tagsOf(clusters[0] as Array<{ tag: string }>)).toEqual(
      [...GAMING].toSorted(),
    );
  });

  it("orders members most-central first", () => {
    // `ps5` is connected to everything; `indie` hangs off one edge.
    const edges = [
      ...clique(GAMING, 0.5),
      { a: "ps5", b: "indie", weight: 0.4 },
    ];

    const clusters = clusterTags(edges);

    expect(clusters[0]?.[0]?.tag).toBe("ps5");
    expect(clusters[0]?.at(-1)?.tag).toBe("indie");
  });

  it("is deterministic regardless of edge input order", () => {
    const edges = [...clique(GAMING, 0.5), ...clique(MUSIC, 0.5)];
    const reversed = [...edges].toReversed();

    expect(clusterTags(reversed).map((c) => tagsOf(c))).toEqual(
      clusterTags(edges).map((c) => tagsOf(c)),
    );
  });

  it("ignores self-edges and singleton tags", () => {
    const clusters = clusterTags([
      ...clique(GAMING, 0.5),
      { a: "lonely", b: "lonely", weight: 1 },
    ]);

    expect(clusters.flatMap((c) => tagsOf(c))).not.toContain("lonely");
  });

  it("returns nothing for an empty graph", () => {
    expect(clusterTags([])).toEqual([]);
  });
});

describe("clusterTags — oversized clusters", () => {
  /**
   * The blob shape in miniature: two sparse groups, each held together by a few
   * strong edges, drowned in a dense mat of individually-weak cross edges. That
   * mat is what fuses them — exactly how a 429-tag cluster forms — and it is
   * the first thing a higher weight floor removes.
   */
  function blob(): Array<TagEdge> {
    const left = Array.from({ length: 12 }, (_, i) => `l${i}`);
    const right = Array.from({ length: 12 }, (_, i) => `r${i}`);
    const bridge: Array<TagEdge> = [];
    for (const a of left) {
      for (const b of right) bridge.push({ a, b, weight: 0.03 });
    }
    return [...ring(left, 0.06), ...ring(right, 0.06), ...bridge];
  }

  it("leaves clusters under the cap alone", () => {
    const clusters = clusterTags(blob(), { maxClusterTags: 100 });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(24);
  });

  it("re-splits a cluster that exceeds the cap", () => {
    const fused = clusterTags(blob(), { maxClusterTags: 100 });
    expect(fused[0]?.length).toBe(24);

    const split = clusterTags(blob(), { maxClusterTags: 20 });

    expect(split.length).toBeGreaterThan(1);
    for (const cluster of split) {
      expect(cluster.length).toBeLessThanOrEqual(20);
    }
  });

  it("keeps the original when a split cannot divide it", () => {
    // A single dense clique has no weak seam to cut, so tightening the graph
    // must not shred it into nothing.
    const dense = clique(
      Array.from({ length: 20 }, (_, i) => `t${i}`),
      0.9,
    );
    const clusters = clusterTags(dense, { maxClusterTags: 5 });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(20);
  });

  it("is still deterministic when splitting", () => {
    const a = clusterTags(blob(), { maxClusterTags: 20 });
    const b = clusterTags(blob().toReversed(), { maxClusterTags: 20 });
    expect(a.map((c) => tagsOf(c))).toEqual(b.map((c) => tagsOf(c)));
  });
});

describe("tagSetSimilarity", () => {
  it("is 1 for identical sets and 0 for disjoint ones", () => {
    expect(tagSetSimilarity(GAMING, [...GAMING])).toBe(1);
    expect(tagSetSimilarity(GAMING, MUSIC)).toBe(0);
  });

  it("scores partial overlap by Jaccard", () => {
    // 2 shared of 4 distinct.
    expect(tagSetSimilarity(["a", "b", "c"], ["b", "c", "d"])).toBeCloseTo(0.5);
  });

  it("is 0 when either side is empty", () => {
    expect(tagSetSimilarity([], GAMING)).toBe(0);
    expect(tagSetSimilarity(GAMING, [])).toBe(0);
  });
});
