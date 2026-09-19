import { describe, expect, it } from "vitest";

import { DEFAULT_STALE_AFTER_MS, judgeFreshness } from "./freshness.ts";

const NOW = Date.parse("2026-09-19T02:00:00.000Z");

function at(offsetMs: number): Date {
  return new Date(NOW - offsetMs);
}

describe("judgeFreshness", () => {
  it("is fresh when the cursor moved seconds ago", () => {
    expect(judgeFreshness(at(3000), NOW, DEFAULT_STALE_AFTER_MS)).toEqual({
      ageMs: 3000,
      stale: false,
    });
  });

  it("is fresh right up to the threshold", () => {
    expect(
      judgeFreshness(at(DEFAULT_STALE_AFTER_MS), NOW, DEFAULT_STALE_AFTER_MS)
        .stale,
    ).toBe(false);
  });

  it("goes stale one millisecond past it", () => {
    expect(
      judgeFreshness(
        at(DEFAULT_STALE_AFTER_MS + 1),
        NOW,
        DEFAULT_STALE_AFTER_MS,
      ).stale,
    ).toBe(true);
  });

  // The outage this exists for: the cursor sat at 2026-09-17T21:15:51Z while
  // the worker crash-looped and was then stopped. Nothing noticed for 29 hours.
  it("catches the September 2026 outage", () => {
    const lastEventAt = new Date("2026-09-17T21:15:51.280Z");
    const result = judgeFreshness(
      lastEventAt,
      Date.parse("2026-09-19T02:21:00.000Z"),
      DEFAULT_STALE_AFTER_MS,
    );
    expect(result.stale).toBe(true);
    expect(Math.round((result.ageMs ?? 0) / 3_600_000)).toBe(29);
  });

  // A worker that has never written a cursor has not started, which is not the
  // same as being fine — and is what a fresh deploy that crashes on boot looks
  // like.
  it("treats a never-written cursor as stale", () => {
    expect(judgeFreshness(null, NOW, DEFAULT_STALE_AFTER_MS)).toEqual({
      ageMs: null,
      stale: true,
    });
  });

  it("honours a custom threshold", () => {
    expect(judgeFreshness(at(60_000), NOW, 30_000).stale).toBe(true);
    expect(judgeFreshness(at(60_000), NOW, 120_000).stale).toBe(false);
  });

  // An archive replay still saves the cursor after every batch, so a worker
  // chewing through a day-old backlog reads as healthy — which it is.
  it("stays fresh during a backlog replay", () => {
    expect(judgeFreshness(at(1200), NOW, DEFAULT_STALE_AFTER_MS).stale).toBe(
      false,
    );
  });
});
