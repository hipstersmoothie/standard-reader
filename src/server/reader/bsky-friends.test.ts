import { describe, expect, it } from "vitest";

import type { PublicationCard } from "#/integrations/tanstack-query/api-shapes";

import type { FriendProfileRow } from "./bsky-friends";
import { buildFriendPublishers } from "./bsky-friends";

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

function profile(did: string, over: Partial<FriendProfileRow> = {}) {
  return {
    did,
    handle: `${did}.example`,
    displayName: null,
    avatarUrl: null,
    ...over,
  } satisfies FriendProfileRow;
}

describe("buildFriendPublishers", () => {
  it("drops followed accounts that publish nothing", () => {
    const people = buildFriendPublishers({
      followedDids: ["did:a", "did:silent"],
      publicationsByDid: new Map([["did:a", [pub("did:a", "a1", 5)]]]),
      profiles: new Map([
        ["did:a", profile("did:a")],
        ["did:silent", profile("did:silent")],
      ]),
      appFollowedDids: new Set(),
    });

    expect(people.map((p) => p.did)).toEqual(["did:a"]);
  });

  it("ranks people by combined readership across their publications", () => {
    const people = buildFriendPublishers({
      followedDids: ["did:small", "did:split", "did:big"],
      publicationsByDid: new Map([
        ["did:small", [pub("did:small", "s1", 40)]],
        // Two modest publications outrank one mid-sized one.
        ["did:split", [pub("did:split", "p1", 30), pub("did:split", "p2", 30)]],
        ["did:big", [pub("did:big", "b1", 100)]],
      ]),
      profiles: new Map(),
      appFollowedDids: new Set(),
    });

    expect(people.map((p) => p.did)).toEqual([
      "did:big",
      "did:split",
      "did:small",
    ]);
  });

  it("breaks readership ties on handle so ordering is stable", () => {
    const people = buildFriendPublishers({
      followedDids: ["did:z", "did:a"],
      publicationsByDid: new Map([
        ["did:z", [pub("did:z", "z1", 10)]],
        ["did:a", [pub("did:a", "a1", 10)]],
      ]),
      profiles: new Map([
        ["did:z", profile("did:z", { handle: "zoe.example" })],
        ["did:a", profile("did:a", { handle: "ana.example" })],
      ]),
      appFollowedDids: new Set(),
    });

    expect(people.map((p) => p.handle)).toEqual(["ana.example", "zoe.example"]);
  });

  it("prefers the profile row for identity and falls back to the publication", () => {
    const people = buildFriendPublishers({
      followedDids: ["did:withprofile", "did:noprofile"],
      publicationsByDid: new Map([
        [
          "did:withprofile",
          [
            pub("did:withprofile", "w1", 2, {
              ownerHandle: "stale.example",
              ownerAvatarUrl: "https://cdn.example/stale.jpg",
            }),
          ],
        ],
        [
          "did:noprofile",
          [
            pub("did:noprofile", "n1", 1, {
              ownerHandle: "fallback.example",
              ownerAvatarUrl: "https://cdn.example/fallback.jpg",
            }),
          ],
        ],
      ]),
      profiles: new Map([
        [
          "did:withprofile",
          profile("did:withprofile", {
            handle: "current.example",
            displayName: "Current Name",
            avatarUrl: "https://cdn.example/current.jpg",
          }),
        ],
      ]),
      appFollowedDids: new Set(),
    });

    const [withProfile, noProfile] = people;
    expect(withProfile).toMatchObject({
      handle: "current.example",
      displayName: "Current Name",
      avatarUrl: "https://cdn.example/current.jpg",
    });
    expect(noProfile).toMatchObject({
      handle: "fallback.example",
      displayName: null,
      avatarUrl: "https://cdn.example/fallback.jpg",
    });
  });

  it("marks people the reader already follows in-app", () => {
    const people = buildFriendPublishers({
      followedDids: ["did:a", "did:b"],
      publicationsByDid: new Map([
        ["did:a", [pub("did:a", "a1", 5)]],
        ["did:b", [pub("did:b", "b1", 4)]],
      ]),
      profiles: new Map(),
      appFollowedDids: new Set(["did:b"]),
    });

    expect(
      Object.fromEntries(people.map((p) => [p.did, p.followedInApp])),
    ).toEqual({ "did:a": false, "did:b": true });
  });
});
