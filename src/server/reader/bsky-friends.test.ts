import { describe, expect, it } from "vitest";

import type { PublicationCard } from "#/integrations/tanstack-query/api-shapes";

import { friendAuthors, rankFriendPublications } from "./bsky-friends";

function pub(
  did: string,
  uri: string,
  subscriberCount: number,
  over: Partial<PublicationCard> = {},
): PublicationCard {
  return {
    uri,
    did,
    name: uri,
    url: `https://${uri}.example`,
    description: null,
    iconUrl: null,
    ownerAvatarUrl: null,
    ownerHandle: null,
    topic: null,
    verified: false,
    hiddenFromDiscover: false,
    subscriberCount,
    documentCount: 1,
    lastDocumentAt: null,
    ...over,
  };
}

describe("rankFriendPublications", () => {
  it("ranks by readership across every writer", () => {
    const ranked = rankFriendPublications(
      ["did:a", "did:b"],
      new Map([
        ["did:a", [pub("did:a", "a-small", 5), pub("did:a", "a-big", 90)]],
        ["did:b", [pub("did:b", "b-mid", 40)]],
      ]),
    );

    expect(ranked.map((p) => p.uri)).toEqual(["a-big", "b-mid", "a-small"]);
  });

  it("breaks ties on name then URI so paging stays stable", () => {
    const ranked = rankFriendPublications(
      ["did:a", "did:b"],
      new Map([
        ["did:a", [pub("did:a", "z-uri", 10, { name: "Same" })]],
        ["did:b", [pub("did:b", "a-uri", 10, { name: "Same" })]],
      ]),
    );

    expect(ranked.map((p) => p.uri)).toEqual(["a-uri", "z-uri"]);
  });

  it("drops publications the reader already subscribes to", () => {
    const ranked = rankFriendPublications(
      ["did:a"],
      new Map([
        ["did:a", [pub("did:a", "known", 90), pub("did:a", "new", 10)]],
      ]),
      new Set(["known"]),
    );

    expect(ranked.map((p) => p.uri)).toEqual(["new"]);
  });

  it("ignores followed accounts that publish nothing", () => {
    const ranked = rankFriendPublications(
      ["did:silent", "did:a"],
      new Map([["did:a", [pub("did:a", "a1", 1)]]]),
    );

    expect(ranked.map((p) => p.uri)).toEqual(["a1"]);
  });
});

describe("friendAuthors", () => {
  it("dedupes writers, keeping rank order", () => {
    const ranked = rankFriendPublications(
      ["did:a", "did:b"],
      new Map([
        [
          "did:a",
          [
            pub("did:a", "a1", 90, { ownerHandle: "ana.example" }),
            pub("did:a", "a2", 5, { ownerHandle: "ana.example" }),
          ],
        ],
        ["did:b", [pub("did:b", "b1", 40, { ownerHandle: "bo.example" })]],
      ]),
    );

    expect(friendAuthors(ranked).map((a) => a.handle)).toEqual([
      "ana.example",
      "bo.example",
    ]);
  });

  it("honours the preview limit", () => {
    const ranked = rankFriendPublications(
      ["did:a", "did:b", "did:c"],
      new Map([
        ["did:a", [pub("did:a", "a1", 30)]],
        ["did:b", [pub("did:b", "b1", 20)]],
        ["did:c", [pub("did:c", "c1", 10)]],
      ]),
    );

    expect(friendAuthors(ranked, 2).map((a) => a.did)).toEqual([
      "did:a",
      "did:b",
    ]);
  });
});
