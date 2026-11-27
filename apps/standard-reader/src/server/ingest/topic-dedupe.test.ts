import { describe, expect, it } from "vitest";

import type { DedupeThresholds, DedupeTopic } from "./topic-dedupe";
import {
  compareSurvivors,
  dedupeByName,
  dedupeTopics,
  normalizeTopicName,
  overlapCoefficient,
  pairKey,
} from "./topic-dedupe";

const THRESHOLDS: DedupeThresholds = {
  establishedAdvantage: 1.5,
  minDocumentOverlap: 0.6,
  minTagOverlap: 0.5,
};

function topic(key: string, overrides: Partial<DedupeTopic> = {}): DedupeTopic {
  return {
    authorCount: 20,
    documentCount: 100,
    established: false,
    key,
    tags: [`${key}-a`, `${key}-b`, `${key}-c`, `${key}-d`],
    ...overrides,
  };
}

function shared(
  ...pairs: Array<[string, string, number]>
): Map<string, number> {
  return new Map(pairs.map(([left, right, n]) => [pairKey(left, right), n]));
}

describe("overlapCoefficient", () => {
  it("measures against the smaller set, so a subset scores 1", () => {
    expect(overlapCoefficient(["a", "b"], ["a", "b", "c", "d", "e"])).toBe(1);
  });

  it("is zero when either side is empty", () => {
    expect(overlapCoefficient([], ["a"])).toBe(0);
  });
});

describe("pairKey", () => {
  it("does not depend on argument order", () => {
    expect(pairKey("x", "y")).toBe(pairKey("y", "x"));
  });
});

describe("dedupeTopics", () => {
  it("absorbs a topic whose feed is mostly another topic's feed", () => {
    // The shape of the report: two AI topics minted on different days whose
    // pages list the same articles.
    const absorbed = dedupeTopics(
      [
        topic("ai-safety", { authorCount: 210, documentCount: 1500 }),
        topic("ai-safety-and-governance-3", {
          authorCount: 160,
          documentCount: 900,
        }),
      ],
      shared(["ai-safety", "ai-safety-and-governance-3", 800]),
      THRESHOLDS,
    );
    expect(absorbed).toEqual(
      new Map([["ai-safety-and-governance-3", "ai-safety"]]),
    );
  });

  it("keeps topics that share a publication's audience but not its articles", () => {
    // A generalist blog sits in both; that alone is not duplication.
    const absorbed = dedupeTopics(
      [topic("life-sciences"), topic("politics", { authorCount: 100 })],
      shared(["life-sciences", "politics", 30]),
      THRESHOLDS,
    );
    expect(absorbed.size).toBe(0);
  });

  it("catches duplicates by tag containment when the feeds are thin", () => {
    const absorbed = dedupeTopics(
      [
        topic("broad", {
          authorCount: 50,
          tags: ["a", "b", "c", "d", "e", "f", "g", "h"],
        }),
        topic("narrow", { authorCount: 10, tags: ["a", "b", "c", "x"] }),
      ],
      new Map(),
      THRESHOLDS,
    );
    expect(absorbed.get("narrow")).toBe("broad");
  });

  it("lets an established topic hold its URL against a slightly bigger newcomer", () => {
    // 30 × 1.5 = 45 beats 40: without the advantage these two would trade
    // places whenever author counts wobble.
    const absorbed = dedupeTopics(
      [
        topic("new", { authorCount: 40 }),
        topic("old", { authorCount: 30, established: true }),
      ],
      shared(["new", "old", 90]),
      THRESHOLDS,
    );
    expect(absorbed.get("new")).toBe("old");
  });

  it("lets a clearly bigger newcomer take over an established topic's area", () => {
    const absorbed = dedupeTopics(
      [
        topic("new", { authorCount: 100 }),
        topic("old", { authorCount: 30, established: true }),
      ],
      shared(["new", "old", 90]),
      THRESHOLDS,
    );
    expect(absorbed.get("old")).toBe("new");
  });

  it("is one hop: an absorbed topic never absorbs anything itself", () => {
    // b duplicates a; c duplicates only b. c must survive rather than redirect
    // to b, which is no longer published.
    const absorbed = dedupeTopics(
      [
        topic("a", { authorCount: 30 }),
        topic("b", { authorCount: 20 }),
        topic("c", { authorCount: 10 }),
      ],
      shared(["a", "b", 90], ["b", "c", 90]),
      THRESHOLDS,
    );
    expect(absorbed).toEqual(new Map([["b", "a"]]));
  });

  it("sends a duplicate to the survivor it overlaps most", () => {
    const absorbed = dedupeTopics(
      [
        topic("first", { authorCount: 50 }),
        topic("second", { authorCount: 40 }),
        topic("dup", { authorCount: 10 }),
      ],
      shared(["first", "dup", 65], ["second", "dup", 95]),
      THRESHOLDS,
    );
    expect(absorbed.get("dup")).toBe("second");
  });

  it("does not depend on input order", () => {
    const topics = [
      topic("a", { authorCount: 20 }),
      topic("b", { authorCount: 20 }),
      topic("c", { authorCount: 20 }),
    ];
    const overlaps = shared(["a", "b", 80], ["b", "c", 80]);
    expect(dedupeTopics(topics, overlaps, THRESHOLDS)).toEqual(
      dedupeTopics(topics.toReversed(), overlaps, THRESHOLDS),
    );
  });
});

describe("compareSurvivors", () => {
  it("breaks a reach tie in favour of the established topic", () => {
    const old = topic("old", { authorCount: 20, established: true });
    const fresh = topic("fresh", { authorCount: 30 });
    expect(compareSurvivors(old, fresh, 1.5)).toBeLessThan(0);
  });
});

describe("normalizeTopicName", () => {
  it("ignores case, accents, ampersands and punctuation", () => {
    expect(normalizeTopicName("Health & Well-being")).toBe(
      normalizeTopicName("health and well being"),
    );
    expect(normalizeTopicName("Société")).toBe("societe");
  });
});

describe("dedupeByName", () => {
  it("folds same-named topics into the strongest", () => {
    const absorbed = dedupeByName(
      [
        {
          ...topic("video-games-44", { authorCount: 58 }),
          name: "Video Games",
        },
        { ...topic("video-games-9", { authorCount: 32 }), name: "video games" },
        { ...topic("tabletop", { authorCount: 59 }), name: "Board Games" },
      ],
      1.5,
    );
    expect(absorbed).toEqual(new Map([["video-games-9", "video-games-44"]]));
  });
});
