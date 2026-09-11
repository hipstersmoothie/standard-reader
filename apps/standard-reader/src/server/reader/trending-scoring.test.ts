import { describe, expect, it } from "vitest";

import type { ArticleTrendingInputs } from "./trending-scoring";
import {
  ARTICLE_BLEND,
  ARTICLE_FRESHNESS_WEIGHT,
  applyTrendingDiversityCaps,
  articleFreshnessFactor,
  articleTrendingScore,
  publicationTrendingBoost,
} from "./trending-scoring";

/** An article nothing has happened to: every engagement input at zero. */
const inert: ArticleTrendingInputs = {
  decayedRecommends: 0,
  recommendVelocity: 0,
  backlinks: 0,
  backlinkVelocity: 0,
  freshness: 1,
  publicationScore: 0,
};

const withSignal = (
  overrides: Partial<ArticleTrendingInputs>,
): ArticleTrendingInputs => ({ ...inert, ...overrides });

describe("articleTrendingScore", () => {
  // The whole read path hangs off this: `trending_score > 0` is what separates
  // the trending set from the rest of the 4-day window, on both the rail and
  // the page. If an unengaged article could score above zero the page would go
  // back to padding itself out with the last four days of everything.
  it("scores an article with no engagement at exactly zero", () => {
    expect(articleTrendingScore(inert)).toBe(0);
    expect(articleTrendingScore({ ...inert, freshness: 0 })).toBe(0);
    expect(articleTrendingScore({ ...inert, publicationScore: 12.5 })).toBe(0);
  });

  it("scores any single engagement signal above zero", () => {
    expect(
      articleTrendingScore(withSignal({ decayedRecommends: 1 })),
    ).toBeGreaterThan(0);
    expect(articleTrendingScore(withSignal({ backlinks: 1 }))).toBeGreaterThan(
      0,
    );
    expect(
      articleTrendingScore(withSignal({ recommendVelocity: 1 })),
    ).toBeGreaterThan(0);
    expect(
      articleTrendingScore(withSignal({ backlinkVelocity: 1 })),
    ).toBeGreaterThan(0);
  });

  // The bug this replaced: one like and zero likes both scored 0, so the page
  // ordered everything below the two-liker floor by publish date.
  it("separates one like from none, and more likes from fewer", () => {
    const none = articleTrendingScore(inert);
    const one = articleTrendingScore(withSignal({ decayedRecommends: 1 }));
    const five = articleTrendingScore(withSignal({ decayedRecommends: 5 }));

    expect(one).toBeGreaterThan(none);
    expect(five).toBeGreaterThan(one);
  });

  it("is non-decreasing in every engagement input", () => {
    const keys = [
      "decayedRecommends",
      "recommendVelocity",
      "backlinks",
      "backlinkVelocity",
    ] as const;

    for (const key of keys) {
      const base = withSignal({ decayedRecommends: 2, backlinks: 3 });
      const more = { ...base, [key]: base[key] + 1 };
      expect(articleTrendingScore(more)).toBeGreaterThan(
        articleTrendingScore(base),
      );
    }
  });

  it("never lets a negative velocity subtract from the score", () => {
    const flat = articleTrendingScore(withSignal({ decayedRecommends: 3 }));
    const cooling = articleTrendingScore(
      withSignal({ decayedRecommends: 3, recommendVelocity: -8 }),
    );
    expect(cooling).toBe(flat);
  });

  it("compresses backlinks logarithmically so a burst cannot swamp likes", () => {
    const tenfold = articleTrendingScore(withSignal({ backlinks: 100 }));
    const single = articleTrendingScore(withSignal({ backlinks: 10 }));
    // 100 backlinks is worth well under 10x what 10 are worth.
    expect(tenfold).toBeLessThan(single * 2);
  });

  it("ranks a fresher article above an older one with the same engagement", () => {
    const fresh = articleTrendingScore(
      withSignal({ decayedRecommends: 4, freshness: 1 }),
    );
    const stale = articleTrendingScore(
      withSignal({ decayedRecommends: 4, freshness: 0.1 }),
    );
    expect(fresh).toBeGreaterThan(stale);
  });

  // Likes already decay by their own timestamps, so article age must not decay
  // them a second time — a day-3 article that did well has to stay reachable.
  it("lets age cost at most ARTICLE_FRESHNESS_WEIGHT of the score", () => {
    const engaged = withSignal({ decayedRecommends: 4 });
    const ancient = articleTrendingScore({ ...engaged, freshness: 0 });
    const brandNew = articleTrendingScore({ ...engaged, freshness: 1 });

    expect(ancient / brandNew).toBeCloseTo(1 - ARTICLE_FRESHNESS_WEIGHT, 10);
  });

  // A well-liked older article must still outrank a barely-liked fresh one,
  // which is exactly what an undamped freshness multiplier would break.
  it("keeps engagement dominant over recency", () => {
    const oldAndLoved = articleTrendingScore(
      withSignal({ decayedRecommends: 6, freshness: 0.1 }),
    );
    const freshAndIgnored = articleTrendingScore(
      withSignal({ decayedRecommends: 1, freshness: 1 }),
    );
    expect(oldAndLoved).toBeGreaterThan(freshAndIgnored);
  });

  describe("parent publication boost", () => {
    it("nudges in both directions without changing sign or zeroing", () => {
      const neutral = articleTrendingScore(
        withSignal({ decayedRecommends: 3 }),
      );
      const strong = articleTrendingScore(
        withSignal({ decayedRecommends: 3, publicationScore: 4 }),
      );
      const weak = articleTrendingScore(
        withSignal({ decayedRecommends: 3, publicationScore: -4 }),
      );

      expect(strong).toBeGreaterThan(neutral);
      expect(weak).toBeLessThan(neutral);
      expect(weak).toBeGreaterThan(0);
    });

    // `publication_stats.trending_score` is an unbounded z-score. Used raw it
    // would dwarf everything the article itself earned.
    it("stays bounded however extreme the publication score", () => {
      const w = ARTICLE_BLEND.parentPublication;
      for (const score of [-1e6, -10, 0, 10, 1e6]) {
        const boost = publicationTrendingBoost(score);
        expect(boost).toBeGreaterThan(1 - w);
        expect(boost).toBeLessThan(1 + w);
      }
      expect(publicationTrendingBoost(0)).toBe(1);
    });

    it("cannot outweigh a real engagement gap", () => {
      const twoLikesBestPublication = articleTrendingScore(
        withSignal({ decayedRecommends: 2, publicationScore: 1e6 }),
      );
      const fourLikesWorstPublication = articleTrendingScore(
        withSignal({ decayedRecommends: 4, publicationScore: -1e6 }),
      );
      expect(fourLikesWorstPublication).toBeGreaterThan(
        twoLikesBestPublication,
      );
    });
  });

  it("clamps freshness to [0, 1] rather than trusting the caller", () => {
    expect(articleFreshnessFactor(5)).toBe(1);
    expect(articleFreshnessFactor(-5)).toBe(1 - ARTICLE_FRESHNESS_WEIGHT);
  });
});

const article = (uri: string, publicationUri: string | null, did: string) => ({
  uri,
  publicationUri,
  did,
});

describe("applyTrendingDiversityCaps", () => {
  it("keeps at most one article per publication and per author", () => {
    const capped = applyTrendingDiversityCaps(
      [
        article("a1", "pub-1", "did:a"),
        article("a2", "pub-1", "did:b"),
        article("a3", "pub-2", "did:a"),
        article("a4", "pub-2", "did:c"),
        article("a5", "pub-3", "did:d"),
      ],
      5,
    );

    expect(capped.map((a) => a.uri)).toEqual(["a1", "a4", "a5"]);
  });

  it("treats a loose document as its own publication", () => {
    const capped = applyTrendingDiversityCaps(
      [
        article("loose-1", null, "did:a"),
        article("loose-2", null, "did:b"),
        article("loose-3", null, "did:c"),
      ],
      3,
    );

    expect(capped).toHaveLength(3);
  });

  it("stops at the limit", () => {
    const capped = applyTrendingDiversityCaps(
      Array.from({ length: 10 }, (_, i) =>
        article(`a${i}`, `pub-${i}`, `did:${i}`),
      ),
      3,
    );
    expect(capped).toHaveLength(3);
  });
});
