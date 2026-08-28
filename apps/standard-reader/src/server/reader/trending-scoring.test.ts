import { describe, expect, it } from "vitest";

import { HOT_WINDOW_DAYS } from "#/server/announce/config";
import { DIGEST_WINDOW_DAYS } from "#/server/digest/config";
import {
  BACKLINK_SYNC_MAX_AGE_DAYS,
  TRENDING_MAX_AGE_DAYS,
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
