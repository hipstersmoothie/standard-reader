import { describe, expect, it } from "vitest";

import { isoWeekKey } from "./week.ts";

describe("isoWeekKey", () => {
  it("gives every day of one ISO week the same key", () => {
    // Mon 2026-08-10 → Sun 2026-08-16.
    const keys = new Set(
      [10, 11, 12, 13, 14, 15, 16].map((day) =>
        isoWeekKey(new Date(Date.UTC(2026, 7, day, 16, 0, 0))),
      ),
    );
    expect([...keys]).toEqual(["2026-W33"]);
  });

  it("rolls over on Monday, so the next Friday is a new week", () => {
    const friday = new Date("2026-08-14T16:00:00.000Z");
    const nextFriday = new Date("2026-08-21T16:00:00.000Z");
    expect(isoWeekKey(friday)).toBe("2026-W33");
    expect(isoWeekKey(nextFriday)).toBe("2026-W34");
  });

  it("is stable across the hours of a single cron day", () => {
    const key = isoWeekKey(new Date("2026-08-14T16:00:00.000Z"));
    for (const hour of [0, 1, 15, 16, 17, 23]) {
      expect(isoWeekKey(new Date(Date.UTC(2026, 7, 14, hour, 30)))).toBe(key);
    }
  });

  it("pads the week number to two digits", () => {
    expect(isoWeekKey(new Date("2026-01-08T00:00:00.000Z"))).toBe("2026-W02");
  });

  it("handles the year boundary the ISO way", () => {
    // 2027-01-01 is a Friday, so it belongs to ISO week 53 of 2026.
    expect(isoWeekKey(new Date("2027-01-01T16:00:00.000Z"))).toBe("2026-W53");
    // 2026-01-01 is a Thursday → week 1 of 2026.
    expect(isoWeekKey(new Date("2026-01-01T16:00:00.000Z"))).toBe("2026-W01");
    // 2025-01-01 is a Wednesday → also week 1 of its own year.
    expect(isoWeekKey(new Date("2025-01-01T16:00:00.000Z"))).toBe("2025-W01");
    // 2023-01-01 is a Sunday → the tail of ISO week 52 of 2022.
    expect(isoWeekKey(new Date("2023-01-01T16:00:00.000Z"))).toBe("2022-W52");
  });
});

describe("isoWeekKey ordering", () => {
  // `findWeekThreadRoot` walks the bot's posts newest-first and stops when a
  // record's week sorts before the one it wants, so the keys must compare.
  it("compares lexicographically in calendar order", () => {
    const keys = [
      "2025-W52",
      "2026-W01",
      "2026-W09",
      "2026-W10",
      "2026-W33",
      "2026-W53",
      "2027-W01",
    ];
    expect(keys.toSorted()).toEqual(keys);
  });
});
