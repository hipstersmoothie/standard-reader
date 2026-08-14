import { describe, expect, it } from "vitest";

import type { MutedSubjects } from "./mutes";
import {
  classifyMuteSubject,
  isCardMuted,
  muteCandidateKeys,
  rejectMutedCards,
} from "./mutes";

const PUB_URI = "at://did:plc:owner/site.standard.publication/3kabc";

const muted = (
  dids: Array<string> = [],
  uris: Array<string> = [],
): MutedSubjects => ({ dids: new Set(dids), uris: new Set(uris) });

describe("classifyMuteSubject", () => {
  it("classifies a DID as a user mute", () => {
    expect(classifyMuteSubject("did:plc:abc123")).toEqual({
      kind: "user",
      did: "did:plc:abc123",
    });
  });

  it("classifies a publication AT-URI as a publication mute", () => {
    expect(classifyMuteSubject(PUB_URI)).toEqual({
      kind: "publication",
      uri: PUB_URI,
    });
  });

  it("rejects AT-URIs of other collections", () => {
    expect(
      classifyMuteSubject("at://did:plc:owner/site.standard.document/3kabc"),
    ).toBeNull();
    expect(
      classifyMuteSubject("at://did:plc:owner/app.bsky.graph.block/3kabc"),
    ).toBeNull();
  });

  it("rejects malformed subjects", () => {
    expect(classifyMuteSubject("")).toBeNull();
    expect(classifyMuteSubject("https://example.com")).toBeNull();
    expect(classifyMuteSubject("at://did:plc:owner")).toBeNull();
    // Missing rkey.
    expect(
      classifyMuteSubject("at://did:plc:owner/site.standard.publication"),
    ).toBeNull();
    expect(
      classifyMuteSubject("at://did:plc:owner/site.standard.publication/"),
    ).toBeNull();
    // Trailing path segment.
    expect(classifyMuteSubject(`${PUB_URI}/extra`)).toBeNull();
    // Handle authority — tap always emits DIDs, so anything else is malformed.
    expect(
      classifyMuteSubject("at://alice.test/site.standard.publication/3kabc"),
    ).toBeNull();
    expect(classifyMuteSubject(42)).toBeNull();
    expect(classifyMuteSubject(null)).toBeNull();
  });
});

describe("muteCandidateKeys", () => {
  it("collects every DID and URI a card set renders, deduped", () => {
    expect(
      muteCandidateKeys([
        {
          did: "did:plc:author",
          publicationOwnerDid: "did:plc:owner",
          publicationUri: PUB_URI,
        },
        { did: "did:plc:author", uri: PUB_URI },
        { did: null, publicationUri: null },
      ]),
    ).toEqual({
      dids: ["did:plc:author", "did:plc:owner"],
      uris: [PUB_URI],
    });
  });
});

describe("isCardMuted", () => {
  it("matches the author DID", () => {
    expect(
      isCardMuted({ did: "did:plc:author" }, muted(["did:plc:author"])),
    ).toBe(true);
  });

  it("matches the publication owner DID (guest posts)", () => {
    expect(
      isCardMuted(
        { did: "did:plc:guest", publicationOwnerDid: "did:plc:owner" },
        muted(["did:plc:owner"]),
      ),
    ).toBe(true);
  });

  it("matches the document's publication URI", () => {
    expect(
      isCardMuted(
        { did: "did:plc:author", publicationUri: PUB_URI },
        muted([], [PUB_URI]),
      ),
    ).toBe(true);
  });

  it("matches a publication card's own URI", () => {
    expect(
      isCardMuted({ did: "did:plc:owner", uri: PUB_URI }, muted([], [PUB_URI])),
    ).toBe(true);
  });

  it("passes an unmuted card through", () => {
    expect(
      isCardMuted(
        { did: "did:plc:author", publicationUri: PUB_URI },
        muted(
          ["did:plc:other"],
          ["at://did:plc:x/site.standard.publication/y"],
        ),
      ),
    ).toBe(false);
  });
});

describe("rejectMutedCards", () => {
  const cards = [
    { id: 1, did: "did:plc:author" },
    { id: 2, did: "did:plc:guest", publicationOwnerDid: "did:plc:owner" },
    { id: 3, did: "did:plc:fine", publicationUri: PUB_URI },
    { id: 4, did: "did:plc:fine" },
  ];

  it("drops cards muted through any surface", () => {
    expect(
      rejectMutedCards(
        cards,
        muted(["did:plc:author", "did:plc:owner"], [PUB_URI]),
      ),
    ).toEqual([{ id: 4, did: "did:plc:fine" }]);
  });

  it("returns the same array when nothing is muted", () => {
    expect(rejectMutedCards(cards, muted())).toBe(cards);
  });
});
