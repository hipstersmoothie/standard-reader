import { describe, expect, it } from "vitest";

import { rotateRail, rotationSeed } from "./rail-rotation";

const candidates = Array.from({ length: 30 }, (_, i) => `pub-${i}`);

describe("rotateRail", () => {
  it("returns the input unchanged when the pool is not larger than the limit", () => {
    const small = candidates.slice(0, 5);
    expect(rotateRail(small, 5, "seed")).toEqual(small);
    expect(rotateRail(small, 10, "seed")).toEqual(small);
  });

  it("is stable for the same seed", () => {
    const a = rotateRail(candidates, 6, "home:did:2026-07-11");
    const b = rotateRail(candidates, 6, "home:did:2026-07-11");
    expect(a).toEqual(b);
  });

  it("differs across seeds (day / surface / viewer)", () => {
    const day1 = rotateRail(candidates, 6, "home:did:2026-07-11");
    const day2 = rotateRail(candidates, 6, "home:did:2026-07-12");
    const surface = rotateRail(candidates, 6, "discover:did:2026-07-11");
    expect(day1).not.toEqual(day2);
    expect(day1).not.toEqual(surface);
  });

  it("draws exactly `limit` distinct candidates from the pool", () => {
    const out = rotateRail(candidates, 6, "seed");
    expect(out).toHaveLength(6);
    expect(new Set(out).size).toBe(6);
    for (const uri of out) {
      expect(candidates).toContain(uri);
    }
  });

  it("biases toward higher-ranked candidates over many seeds", () => {
    // Rank 0 should be selected far more often than rank 20 across many days.
    const picks = new Map<string, number>();
    for (let day = 0; day < 500; day++) {
      for (const uri of rotateRail(candidates, 6, `home:did:day-${day}`)) {
        picks.set(uri, (picks.get(uri) ?? 0) + 1);
      }
    }
    const topRankRate = picks.get("pub-0") ?? 0;
    const tailRate = picks.get("pub-20") ?? 0;
    expect(topRankRate).toBeGreaterThan(tailRate);
    // ...but the tail still surfaces sometimes — that's the whole point.
    expect(tailRate).toBeGreaterThan(0);
  });
});

describe("rotationSeed", () => {
  it("encodes surface, viewer, and UTC day", () => {
    const now = new Date("2026-07-11T15:30:00Z");
    expect(rotationSeed("home", "did:plc:abc", now)).toBe(
      "home:did:plc:abc:2026-07-11",
    );
  });

  it("is constant across a UTC day but changes at the boundary", () => {
    const morning = new Date("2026-07-11T00:01:00Z");
    const night = new Date("2026-07-11T23:59:00Z");
    const nextDay = new Date("2026-07-12T00:01:00Z");
    expect(rotationSeed("home", "v", morning)).toBe(
      rotationSeed("home", "v", night),
    );
    expect(rotationSeed("home", "v", morning)).not.toBe(
      rotationSeed("home", "v", nextDay),
    );
  });
});
