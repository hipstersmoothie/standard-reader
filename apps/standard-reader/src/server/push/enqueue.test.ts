import { describe, expect, it } from "vitest";

import { recordClaimsPublishDate } from "./enqueue";

/**
 * The guard that stops an archive import from notifying about everything.
 *
 * `documents.published_at` can't be trusted for this: `upsertDocument` computes
 * it as `publishedAt ?? updatedAt ?? new Date()`, so an undated record lands
 * with `published_at = now()` and passes any freshness window. Checking the
 * record itself is what closes that.
 */
describe("recordClaimsPublishDate", () => {
  it("accepts a record with a publishedAt", () => {
    expect(
      recordClaimsPublishDate({ publishedAt: "2026-08-09T12:00:00.000Z" }),
    ).toBe(true);
  });

  it("falls back to updatedAt when publishedAt is missing", () => {
    expect(
      recordClaimsPublishDate({ updatedAt: "2026-08-09T12:00:00.000Z" }),
    ).toBe(true);
  });

  it("rejects a record with no dates at all", () => {
    // This is the archive-import case: 200 undated posts would otherwise all
    // land with published_at = now() and notify.
    expect(recordClaimsPublishDate({})).toBe(false);
  });

  it("rejects unparseable dates", () => {
    expect(recordClaimsPublishDate({ publishedAt: "sometime last year" })).toBe(
      false,
    );
    expect(recordClaimsPublishDate({ publishedAt: "" })).toBe(false);
  });

  it("rejects non-string date fields", () => {
    // Records come off the firehose untyped, so a number or an object here is
    // a real possibility rather than a hypothetical.
    expect(recordClaimsPublishDate({ publishedAt: 1_754_740_800_000 })).toBe(
      false,
    );
    expect(recordClaimsPublishDate({ publishedAt: null })).toBe(false);
    expect(recordClaimsPublishDate({ updatedAt: { at: "now" } })).toBe(false);
  });

  it("accepts when one of the two dates is usable", () => {
    expect(
      recordClaimsPublishDate({
        publishedAt: "not a date",
        updatedAt: "2026-08-09T12:00:00.000Z",
      }),
    ).toBe(true);
  });
});
