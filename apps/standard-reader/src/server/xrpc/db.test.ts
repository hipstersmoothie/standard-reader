import { describe, expect, it } from "vitest";

import {
  decodeCursor,
  effectiveBridgeExclusion,
  encodeCursor,
  nextCursor,
} from "./db";

describe("XRPC cursor pagination", () => {
  it("round-trips offsets through base64url cursors", () => {
    expect(decodeCursor(encodeCursor(24))).toBe(24);
    expect(decodeCursor()).toBe(0);
    expect(decodeCursor("not-a-cursor")).toBe(0);
  });

  it("nextCursor returns null when the page is exhausted", () => {
    expect(nextCursor(0, 20, 15)).toBeNull();
    expect(nextCursor(0, 20, 40)).toBe(encodeCursor(20));
  });
});

describe("effectiveBridgeExclusion", () => {
  it("hides every bridge from an anonymous caller", () => {
    // Same corpus the signed-out app shows.
    expect(
      effectiveBridgeExclusion(
        { excludeBridged: "all", hasReaderSession: false },
        null,
      ),
    ).toBe("all");
  });

  it("keeps the signed-in default for a DID-token caller", () => {
    // No cookie, so the resolver guessed "all" — but this caller is signed in
    // and their own preference simply is not readable from here.
    expect(
      effectiveBridgeExclusion(
        { excludeBridged: "all", hasReaderSession: false },
        { did: "did:plc:example" },
      ),
    ).toBe(false);
  });

  it("honours a cookie session's own preference either way", () => {
    expect(
      effectiveBridgeExclusion(
        { excludeBridged: "web", hasReaderSession: true },
        { did: "did:plc:example" },
      ),
    ).toBe("web");
    expect(
      effectiveBridgeExclusion(
        { excludeBridged: false, hasReaderSession: true },
        null,
      ),
    ).toBe(false);
  });
});
