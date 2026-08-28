import { describe, expect, it } from "vitest";

import type { PersonCandidate } from "./people-search";
import { personMatchScore, rankPersonRows } from "./people-search";

function person(
  did: string,
  overrides: Partial<PersonCandidate> = {},
): PersonCandidate {
  return {
    avatarUrl: null,
    did,
    displayName: null,
    handle: null,
    publicationCount: 0,
    publicationNames: [],
    subscriberCount: 0,
    ...overrides,
  };
}

describe("personMatchScore", () => {
  it("ranks an exact handle highest", () => {
    expect(
      personMatchScore({ displayName: null, handle: "alice.dev" }, "alice.dev"),
    ).toBe(4);
  });

  it("ignores a leading @ and case", () => {
    expect(
      personMatchScore(
        { displayName: null, handle: "alice.dev" },
        "@Alice.Dev",
      ),
    ).toBe(4);
  });

  it("ranks a handle prefix and an exact display name together", () => {
    expect(
      personMatchScore({ displayName: null, handle: "alice.dev" }, "alice"),
    ).toBe(3);
    expect(
      personMatchScore(
        { displayName: "Alice Ng", handle: "a.dev" },
        "alice ng",
      ),
    ).toBe(3);
  });

  it("ranks a display-name word prefix above a bare substring", () => {
    expect(
      personMatchScore({ displayName: "Alice Ng", handle: "a.dev" }, "ng"),
    ).toBe(2);
    // "lic" appears inside "Alice" but starts no word.
    expect(
      personMatchScore({ displayName: "Alice Ng", handle: "a.dev" }, "lic"),
    ).toBe(1);
  });

  it("scores nothing for an empty query", () => {
    expect(
      personMatchScore({ displayName: "Alice", handle: "alice.dev" }, "  "),
    ).toBe(0);
  });
});

describe("rankPersonRows", () => {
  it("puts match quality ahead of reach", () => {
    const rows = [
      person("did:plc:big", {
        displayName: "Alice Adjacent",
        handle: "big.dev",
        subscriberCount: 10_000,
      }),
      person("did:plc:exact", { handle: "alice", subscriberCount: 1 }),
    ];
    expect(rankPersonRows(rows, "alice").map((row) => row.did)).toEqual([
      "did:plc:exact",
      "did:plc:big",
    ]);
  });

  it("breaks ties on readership, then publications, then did", () => {
    const rows = [
      person("did:plc:c", { handle: "alice.c", publicationCount: 1 }),
      person("did:plc:a", { handle: "alice.a", publicationCount: 1 }),
      person("did:plc:b", { handle: "alice.b", subscriberCount: 5 }),
    ];
    expect(rankPersonRows(rows, "alice").map((row) => row.did)).toEqual([
      "did:plc:b",
      "did:plc:a",
      "did:plc:c",
    ]);
  });

  it("does not mutate its input", () => {
    const rows = [
      person("did:plc:z", { handle: "zed" }),
      person("did:plc:a", { handle: "alice" }),
    ];
    rankPersonRows(rows, "alice");
    expect(rows.map((row) => row.did)).toEqual(["did:plc:z", "did:plc:a"]);
  });
});
