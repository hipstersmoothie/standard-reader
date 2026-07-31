import { describe, expect, it } from "vitest";

import type { BlockEdge } from "./blocks";
import {
  blockIsFromList,
  blockIsOutgoing,
  blockSubjectDids,
  isCardBlocked,
  mergeBlockEdges,
  preferredBlockEdge,
  rejectBlockedCards,
  uriAuthorityDid,
} from "./blocks";

const edge = (
  did: string,
  direction: BlockEdge["direction"],
  listUri: string | null = null,
): BlockEdge => ({ did, direction, listUri });

describe("blockIsOutgoing", () => {
  it("treats both of the reader's own block sources as theirs", () => {
    expect(blockIsOutgoing("blocking")).toBe(true);
    expect(blockIsOutgoing("list-blocking")).toBe(true);
  });

  it("does not claim a block made against the reader", () => {
    expect(blockIsOutgoing("blocked-by")).toBe(false);
    expect(blockIsOutgoing("list-blocked-by")).toBe(false);
  });
});

describe("blockIsFromList", () => {
  it("separates list-sourced blocks from direct records", () => {
    expect(blockIsFromList("list-blocking")).toBe(true);
    expect(blockIsFromList("list-blocked-by")).toBe(true);
    expect(blockIsFromList("blocking")).toBe(false);
    expect(blockIsFromList("blocked-by")).toBe(false);
  });
});

describe("preferredBlockEdge", () => {
  it("prefers the reader's own direct block, whichever order it arrives in", () => {
    const mine = edge("did:plc:a", "blocking");
    const theirs = edge("did:plc:a", "blocked-by");
    expect(preferredBlockEdge(mine, theirs)).toBe(mine);
    expect(preferredBlockEdge(theirs, mine)).toBe(mine);
  });

  it("prefers a direct block over a list block", () => {
    const direct = edge("did:plc:a", "blocking");
    const viaList = edge("did:plc:a", "list-blocking", "at://did:plc:l/list/1");
    expect(preferredBlockEdge(viaList, direct)).toBe(direct);
  });

  it("prefers an incoming direct block over an incoming list block", () => {
    const direct = edge("did:plc:a", "blocked-by");
    const viaList = edge(
      "did:plc:a",
      "list-blocked-by",
      "at://did:plc:l/list/1",
    );
    expect(preferredBlockEdge(viaList, direct)).toBe(direct);
  });
});

describe("mergeBlockEdges", () => {
  it("collapses several edges per account to the most actionable one", () => {
    const merged = mergeBlockEdges([
      edge("did:plc:a", "blocked-by"),
      edge("did:plc:a", "list-blocking", "at://did:plc:l/list/1"),
      edge("did:plc:a", "blocking"),
      edge("did:plc:b", "list-blocked-by", "at://did:plc:l/list/2"),
    ]);
    expect(merged.size).toBe(2);
    expect(merged.get("did:plc:a")?.direction).toBe("blocking");
    expect(merged.get("did:plc:b")?.direction).toBe("list-blocked-by");
  });

  it("keeps the list URI of the edge it settles on", () => {
    const merged = mergeBlockEdges([
      edge("did:plc:a", "list-blocking", "at://did:plc:l/list/1"),
    ]);
    expect(merged.get("did:plc:a")?.listUri).toBe("at://did:plc:l/list/1");
  });
});

describe("blockSubjectDids", () => {
  it("collects author and publication-owner DIDs, deduped", () => {
    const dids = blockSubjectDids([
      { did: "did:plc:author", publicationOwnerDid: "did:plc:owner" },
      { did: "did:plc:author" },
      { did: null, publicationOwnerDid: "did:plc:owner" },
    ]);
    expect(dids.toSorted()).toEqual(["did:plc:author", "did:plc:owner"]);
  });

  it("is empty for cards that render no account", () => {
    expect(blockSubjectDids([{ did: null }, {}])).toEqual([]);
  });
});

describe("isCardBlocked", () => {
  const blocked = new Set(["did:plc:blocked"]);

  it("blocks on the author", () => {
    expect(isCardBlocked({ did: "did:plc:blocked" }, blocked)).toBe(true);
  });

  it("blocks on the publication owner even when the author is fine", () => {
    expect(
      isCardBlocked(
        { did: "did:plc:guest", publicationOwnerDid: "did:plc:blocked" },
        blocked,
      ),
    ).toBe(true);
  });

  it("leaves unrelated cards alone", () => {
    expect(isCardBlocked({ did: "did:plc:other" }, blocked)).toBe(false);
  });

  it("is a no-op for a reader with no blocks", () => {
    expect(isCardBlocked({ did: "did:plc:blocked" }, new Set())).toBe(false);
  });
});

describe("rejectBlockedCards", () => {
  it("drops only the blocked cards", () => {
    const cards = [
      { did: "did:plc:a" },
      { did: "did:plc:blocked" },
      { did: "did:plc:b", publicationOwnerDid: "did:plc:blocked" },
    ];
    expect(rejectBlockedCards(cards, new Set(["did:plc:blocked"]))).toEqual([
      { did: "did:plc:a" },
    ]);
  });

  it("returns the same array identity when nothing is blocked", () => {
    const cards = [{ did: "did:plc:a" }];
    expect(rejectBlockedCards(cards, new Set())).toBe(cards);
  });
});

describe("uriAuthorityDid", () => {
  it("reads the owner DID off a record URI", () => {
    expect(
      uriAuthorityDid("at://did:plc:abc/site.standard.publication/1"),
    ).toBe("did:plc:abc");
  });

  it("reads a bare repo URI", () => {
    expect(uriAuthorityDid("at://did:plc:abc")).toBe("did:plc:abc");
  });

  it("rejects a handle authority — blocks are keyed by DID", () => {
    expect(uriAuthorityDid("at://alice.bsky.social/x/1")).toBeNull();
  });

  it("rejects anything that isn't an AT-URI", () => {
    expect(uriAuthorityDid("https://example.com/post")).toBeNull();
  });
});
