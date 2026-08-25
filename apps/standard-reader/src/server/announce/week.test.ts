import { parse as parseTid, validate as validateTid } from "@atcute/tid";
import { describe, expect, it } from "vitest";

import { isoWeekKey, threadRkeys, weekAnchor } from "./week.ts";

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

describe("weekAnchor", () => {
  it("is that week's Friday at the cron hour", () => {
    expect(weekAnchor("2026-W33").toISOString()).toBe(
      "2026-08-14T16:00:00.000Z",
    );
    expect(weekAnchor("2026-W34").toISOString()).toBe(
      "2026-08-21T16:00:00.000Z",
    );
  });

  it("round-trips with isoWeekKey", () => {
    for (const key of ["2025-W01", "2026-W01", "2026-W33", "2026-W53"]) {
      expect(isoWeekKey(weekAnchor(key))).toBe(key);
    }
  });

  it("rejects anything that isn't an ISO week key", () => {
    expect(() => weekAnchor("2026-08-14")).toThrow(/Not an ISO week key/);
  });
});

describe("threadRkeys", () => {
  it("gives the same week the same keys every time", () => {
    expect(threadRkeys("2026-W33", 6)).toEqual(threadRkeys("2026-W33", 6));
  });

  it("gives different weeks different keys", () => {
    const a = threadRkeys("2026-W33", 6);
    const b = threadRkeys("2026-W34", 6);
    expect(a.filter((rkey) => b.includes(rkey))).toEqual([]);
  });

  it("mints valid, distinct, thread-ordered TIDs", () => {
    const rkeys = threadRkeys("2026-W33", 6);
    expect(rkeys).toHaveLength(6);
    expect(new Set(rkeys).size).toBe(6);
    for (const rkey of rkeys) expect(validateTid(rkey)).toBe(true);
    // TIDs sort lexicographically by timestamp, so thread order is rkey order.
    expect(rkeys.toSorted()).toEqual(rkeys);
  });

  it("seeds the TIDs from the week's anchor instant", () => {
    const [first] = threadRkeys("2026-W33", 6);
    expect(parseTid(first).timestamp).toBe(
      weekAnchor("2026-W33").getTime() * 1000,
    );
  });

  it("keeps a shorter thread's keys a prefix of a longer one's", () => {
    // An empty-ish week that later re-posts with more articles must reuse the
    // keys it already wrote rather than shifting every post to a new record.
    expect(threadRkeys("2026-W33", 4)).toEqual(
      threadRkeys("2026-W33", 6).slice(0, 4),
    );
  });
});
