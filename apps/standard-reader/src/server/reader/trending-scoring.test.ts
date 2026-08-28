import { describe, expect, it } from "vitest";

import { HOT_WINDOW_DAYS } from "#/server/announce/config";
import { DIGEST_WINDOW_DAYS } from "#/server/digest/config";
import {
  BACKLINK_SYNC_MAX_AGE_DAYS,
  ENGAGEMENT_HALF_LIFE_HOURS,
  HALF_LIFE_HOURS,
  TRENDING_MAX_AGE_DAYS,
  WEEK_HALF_LIFE_HOURS,
} from "#/server/reader/trending-scoring";

/**
 * The backlink sync window has to cover every window that reads
 * `documents.backlink_count`, or the widest reader silently ranks on frozen
 * totals. That is exactly how the weekly thread ended up scoring days 5-7 of its
 * 7-day window on backlink counts that stopped moving on day 4 — the sync only
 * covered the 4-day trending slice. These fail the moment a consumer widens its
 * window past the sync again.
 */
describe("backlink sync window", () => {
  it("covers the weekly Bluesky thread's ranking window", () => {
    expect(BACKLINK_SYNC_MAX_AGE_DAYS).toBeGreaterThanOrEqual(HOT_WINDOW_DAYS);
  });

  it("covers the weekly digest's ranking window", () => {
    expect(BACKLINK_SYNC_MAX_AGE_DAYS).toBeGreaterThanOrEqual(
      DIGEST_WINDOW_DAYS,
    );
  });

  it("covers the discover trending slice", () => {
    expect(BACKLINK_SYNC_MAX_AGE_DAYS).toBeGreaterThanOrEqual(
      TRENDING_MAX_AGE_DAYS,
    );
  });
});

/** The decay weight an article carries at `ageHours`. Mirrors `halfLifeDecaySql`. */
function decay(ageHours: number, halfLifeHours: number): number {
  return Math.exp((-Math.LN2 * ageHours) / halfLifeHours);
}

/**
 * Decay is a tie-breaker between comparably-liked articles, not a second
 * ranking. Both engagement curves are pinned to "half-life = the window being
 * ranked", so nothing in a window is ever worth less than half of a
 * just-published article — which is the same as saying the half-life may not
 * drop below the window. Sharpen one past that and the far edge of its own
 * window stops being reachable no matter how many readers recommend it.
 */
describe("engagement decay is subtle across its window", () => {
  it("keeps half a 4-day-old article's engagement at the trending gate", () => {
    const atGate = decay(
      TRENDING_MAX_AGE_DAYS * 24,
      ENGAGEMENT_HALF_LIFE_HOURS,
    );
    expect(atGate).toBeGreaterThanOrEqual(0.5);
  });

  it("keeps half a 7-day-old article's score at the week-in-review edge", () => {
    const atEdge = decay(HOT_WINDOW_DAYS * 24, WEEK_HALF_LIFE_HOURS);
    expect(atEdge).toBeGreaterThanOrEqual(0.5);
  });

  it("ages engagement more gently than the standalone freshness term", () => {
    // Freshness is the sharp "posted just now" signal and carries its own blend
    // weight; reusing it for engagement would apply age to the score twice.
    expect(ENGAGEMENT_HALF_LIFE_HOURS).toBeGreaterThan(HALF_LIFE_HOURS);
    expect(WEEK_HALF_LIFE_HOURS).toBeGreaterThan(ENGAGEMENT_HALF_LIFE_HOURS);
  });
});
