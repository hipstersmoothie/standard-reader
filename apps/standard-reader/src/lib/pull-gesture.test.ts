import { describe, expect, it } from "vitest";

import {
  MAX_PULL,
  PULL_THRESHOLD,
  dampPull,
  isVerticalPull,
  pullProgress,
  shouldCommitPull,
} from "./pull-gesture";

describe("dampPull", () => {
  it("ignores upward movement", () => {
    expect(dampPull(-40)).toBe(0);
    expect(dampPull(0)).toBe(0);
  });

  it("tracks the finger almost exactly at the start of the pull", () => {
    // The first few pixels have to feel connected — damping that bites
    // immediately reads as lag.
    expect(dampPull(4)).toBeGreaterThan(3.8);
  });

  it("gets heavier the further it is pulled", () => {
    const first = dampPull(20) - dampPull(10);
    const later = dampPull(120) - dampPull(110);
    expect(later).toBeLessThan(first);
  });

  it("never travels past the ceiling, however hard it is pulled", () => {
    // The curve approaches MAX_PULL asymptotically; far out along it the
    // exponent underflows and it settles exactly on the ceiling.
    expect(dampPull(400)).toBeLessThan(MAX_PULL);
    expect(dampPull(400)).toBeGreaterThan(MAX_PULL - 6);
    expect(dampPull(10_000)).toBeLessThanOrEqual(MAX_PULL);
  });

  it("still leaves the threshold reachable", () => {
    // A threshold the damping curve can't get to would make the gesture
    // impossible; 200px of finger travel has to be more than enough.
    expect(dampPull(200)).toBeGreaterThan(PULL_THRESHOLD);
  });
});

describe("pullProgress", () => {
  it("runs 0 → 1 across the threshold and clamps there", () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(PULL_THRESHOLD / 2)).toBeCloseTo(0.5);
    expect(pullProgress(PULL_THRESHOLD)).toBe(1);
    expect(pullProgress(PULL_THRESHOLD * 4)).toBe(1);
  });
});

describe("shouldCommitPull", () => {
  it("commits once the pull crosses the threshold", () => {
    expect(
      shouldCommitPull({
        dampedDistance: PULL_THRESHOLD,
        elapsedMs: 2000,
        rawDistance: 90,
      }),
    ).toBe(true);
  });

  it("does not commit a slow, short pull", () => {
    expect(
      shouldCommitPull({
        dampedDistance: 30,
        elapsedMs: 2000,
        rawDistance: 32,
      }),
    ).toBe(false);
  });

  it("commits a quick flick that never reached the threshold", () => {
    expect(
      shouldCommitPull({
        dampedDistance: 40,
        elapsedMs: 120,
        rawDistance: 44,
      }),
    ).toBe(true);
  });

  it("ignores a fast twitch that barely moved", () => {
    expect(
      shouldCommitPull({
        dampedDistance: 10,
        elapsedMs: 20,
        rawDistance: 10,
      }),
    ).toBe(false);
  });

  it("treats a zero-length gesture as no gesture", () => {
    expect(
      shouldCommitPull({ dampedDistance: 0, elapsedMs: 0, rawDistance: 0 }),
    ).toBe(false);
  });
});

describe("isVerticalPull", () => {
  it("claims a downward drag", () => {
    expect(isVerticalPull(2, 30)).toBe(true);
  });

  it("leaves horizontal swipes to the page", () => {
    expect(isVerticalPull(40, 12)).toBe(false);
    expect(isVerticalPull(-40, 12)).toBe(false);
  });

  it("leaves upward drags alone", () => {
    expect(isVerticalPull(0, -30)).toBe(false);
  });
});
