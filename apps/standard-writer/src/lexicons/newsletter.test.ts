import { describe, expect, it } from "vitest";

import {
  activeEmails,
  buildSubscriptionRecord,
  chunkListEntries,
  emptySubscriberList,
  mergeEmailsIntoList,
  SUBSCRIBER_LIST_RKEY,
  SUBSCRIPTION_COLLECTION,
  unsubscribeEmailFromList,
} from "./newsletter";

const PUB = "at://did:plc:pub/site.standard.publication/abc";
const T0 = "2026-01-01T00:00:00.000Z";
const T1 = "2026-02-01T00:00:00.000Z";

describe("buildSubscriptionRecord", () => {
  it("sets the $type and normalizes the email", () => {
    const rec = buildSubscriptionRecord({
      publicationUri: PUB,
      email: "  Reader@Example.COM ",
      createdAt: T0,
    });
    expect(rec).toEqual({
      $type: SUBSCRIPTION_COLLECTION,
      publicationUri: PUB,
      email: "reader@example.com",
      createdAt: T0,
    });
  });
});

describe("mergeEmailsIntoList", () => {
  it("adds new addresses and dedupes case-insensitively", () => {
    const list = emptySubscriberList(PUB, T0);
    const merged = mergeEmailsIntoList(
      list,
      ["a@x.com", "A@X.com", "b@x.com"],
      T1,
    );
    expect(merged.entries.map((e) => e.email).toSorted()).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
    expect(merged.updatedAt).toBe(T1);
    expect(merged.entries.every((e) => e.addedAt === T1)).toBe(true);
  });

  it("preserves existing addedAt and skips blanks", () => {
    const list = mergeEmailsIntoList(
      emptySubscriberList(PUB, T0),
      ["a@x.com"],
      T0,
    );
    const merged = mergeEmailsIntoList(list, ["  ", "b@x.com"], T1);
    const a = merged.entries.find((e) => e.email === "a@x.com");
    expect(a?.addedAt).toBe(T0);
    expect(merged.entries).toHaveLength(2);
  });

  it("revives a previously unsubscribed address on re-import", () => {
    let list = mergeEmailsIntoList(
      emptySubscriberList(PUB, T0),
      ["a@x.com"],
      T0,
    );
    list = unsubscribeEmailFromList(list, "a@x.com", T0);
    expect(activeEmails(list)).toEqual([]);
    list = mergeEmailsIntoList(list, ["A@x.com"], T1);
    expect(activeEmails(list)).toEqual(["a@x.com"]);
  });

  it("does not mutate the input record", () => {
    const list = emptySubscriberList(PUB, T0);
    mergeEmailsIntoList(list, ["a@x.com"], T1);
    expect(list.entries).toHaveLength(0);
  });
});

describe("unsubscribeEmailFromList", () => {
  it("marks a matching entry and is a no-op otherwise", () => {
    const list = mergeEmailsIntoList(
      emptySubscriberList(PUB, T0),
      ["a@x.com"],
      T0,
    );
    const after = unsubscribeEmailFromList(list, "A@X.com", T1);
    expect(after.entries[0].unsubscribedAt).toBe(T1);
    // Second unsubscribe returns the same reference (no change).
    expect(unsubscribeEmailFromList(after, "nobody@x.com", T1)).toBe(after);
  });
});

describe("chunkListEntries", () => {
  it("returns a single self record for an empty list", () => {
    expect(chunkListEntries([])).toEqual([
      { rkey: SUBSCRIBER_LIST_RKEY, entries: [] },
    ]);
  });

  it("splits into self, self-1, … past the budget", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      email: `u${i}@x.com`,
      addedAt: T0,
    }));
    const chunks = chunkListEntries(entries, 2);
    expect(chunks.map((c) => c.rkey)).toEqual(["self", "self-1", "self-2"]);
    expect(chunks[0].entries).toHaveLength(2);
    expect(chunks[2].entries).toHaveLength(1);
  });
});
