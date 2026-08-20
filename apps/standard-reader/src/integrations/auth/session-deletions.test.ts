import { beforeEach, describe, expect, it } from "vitest";

import {
  SESSION_DELETION_TTL_MS,
  consumeRecentSessionDeletion,
  recordSessionDeletion,
  resetSessionDeletionsForTest,
} from "./session-deletions";

const DID = "did:plc:v4zpi74gy7enfiwke7hmoxv5";
const OTHER_DID = "did:plc:wayh7z4drxle722hs2cgnhsx";

describe("session deletion tracking", () => {
  beforeEach(() => {
    resetSessionDeletionsForTest();
  });

  it("reports nothing for a DID that was never recorded", () => {
    // The common case: a restore failed for some transient reason. Signing the
    // reader out here would be the bug, not the fix.
    expect(consumeRecentSessionDeletion(DID)).toBe(false);
  });

  it("reports a deletion recorded moments ago", () => {
    recordSessionDeletion(DID);
    expect(consumeRecentSessionDeletion(DID)).toBe(true);
  });

  it("only reports the DID that was actually deleted", () => {
    recordSessionDeletion(DID);
    expect(consumeRecentSessionDeletion(OTHER_DID)).toBe(false);
    expect(consumeRecentSessionDeletion(DID)).toBe(true);
  });

  it("consumes the record so one deletion signs out at most once", () => {
    // Both OAuth client kinds are tried per restore, so the same DID can be
    // asked about twice in quick succession.
    recordSessionDeletion(DID);
    expect(consumeRecentSessionDeletion(DID)).toBe(true);
    expect(consumeRecentSessionDeletion(DID)).toBe(false);
  });

  it("ignores a record older than the TTL", () => {
    const now = 1_000_000;
    recordSessionDeletion(DID, now);
    expect(
      consumeRecentSessionDeletion(DID, now + SESSION_DELETION_TTL_MS + 1),
    ).toBe(false);
  });

  it("still reports a record exactly at the TTL boundary", () => {
    const now = 1_000_000;
    recordSessionDeletion(DID, now);
    expect(
      consumeRecentSessionDeletion(DID, now + SESSION_DELETION_TTL_MS),
    ).toBe(true);
  });

  it("consumes an expired record rather than leaving it to fire later", () => {
    // A stale entry must not survive to sign out a reader who has since
    // signed back in.
    const now = 1_000_000;
    recordSessionDeletion(DID, now);
    consumeRecentSessionDeletion(DID, now + SESSION_DELETION_TTL_MS + 1);
    expect(consumeRecentSessionDeletion(DID, now + 1)).toBe(false);
  });

  it("prunes expired entries for other DIDs as new ones arrive", () => {
    const now = 1_000_000;
    recordSessionDeletion(DID, now);
    recordSessionDeletion(OTHER_DID, now + SESSION_DELETION_TTL_MS + 1);
    // The first DID's record aged out and was pruned by the second record.
    expect(consumeRecentSessionDeletion(DID, now + 1)).toBe(false);
  });

  it("lets a re-recorded deletion fire again", () => {
    // A reader who signs back in and loses the session again should still be
    // recovered the second time.
    recordSessionDeletion(DID);
    expect(consumeRecentSessionDeletion(DID)).toBe(true);
    recordSessionDeletion(DID);
    expect(consumeRecentSessionDeletion(DID)).toBe(true);
  });
});
