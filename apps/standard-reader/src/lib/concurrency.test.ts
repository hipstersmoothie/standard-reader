import { describe, expect, test } from "vitest";

import { chunk, mapWithConcurrency } from "./concurrency.ts";

describe("mapWithConcurrency", () => {
  test("preserves input order regardless of completion order", async () => {
    const out = await mapWithConcurrency([30, 10, 20, 0], 2, async (ms) => {
      await new Promise((r) => setTimeout(r, ms));
      return ms;
    });
    expect(out).toEqual([30, 10, 20, 0]);
  });

  test("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      3,
      async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
      },
    );
    expect(peak).toBe(3);
  });

  test("handles an empty list without spawning workers", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });

  test("a limit above the item count spawns only as many workers as items", async () => {
    let peak = 0;
    let active = 0;
    await mapWithConcurrency([1, 2], 100, async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });

  test("visits every item exactly once", async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const seen: Array<number> = [];
    await mapWithConcurrency(items, 7, async (n) => {
      seen.push(n);
      return n;
    });
    expect(seen.toSorted((a, b) => a - b)).toEqual(items);
  });
});

describe("chunk", () => {
  test("splits into full chunks plus a remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  test("returns nothing for an empty list", () => {
    expect(chunk([], 3)).toEqual([]);
  });
});
