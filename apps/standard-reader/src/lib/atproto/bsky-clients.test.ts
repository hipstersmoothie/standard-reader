import { describe, expect, it } from "vitest";

import {
  bskyClientProfileIdent,
  bskyClientRefAtUri,
  isBskyClientHost,
  parseBskyClientUrl,
} from "./bsky-clients";

describe("isBskyClientHost", () => {
  it("accepts bsky.app and the social-app forks", () => {
    expect(isBskyClientHost("bsky.app")).toBe(true);
    expect(isBskyClientHost("Witchsky.app")).toBe(true);
    expect(isBskyClientHost("mu.social")).toBe(true);
    expect(isBskyClientHost("deer.social")).toBe(true);
  });

  it("rejects lookalikes and unrelated hosts", () => {
    expect(isBskyClientHost("example.com")).toBe(false);
    // A subdomain is a different site, not a client we know the grammar of.
    expect(isBskyClientHost("evil.bsky.app")).toBe(false);
    expect(isBskyClientHost("bsky.app.evil.com")).toBe(false);
  });
});

describe("parseBskyClientUrl", () => {
  it("parses a profile on an alternate client", () => {
    expect(
      parseBskyClientUrl("https://witchsky.app/profile/did:plc:d4t4psds4x5z"),
    ).toEqual({
      host: "witchsky.app",
      ident: "did:plc:d4t4psds4x5z",
      kind: "profile",
    });
  });

  it("parses posts, feeds, lists, and starter packs", () => {
    expect(
      parseBskyClientUrl(
        "https://mu.social/profile/alice.bsky.social/post/3ab",
      ),
    ).toEqual({
      host: "mu.social",
      ident: "alice.bsky.social",
      kind: "post",
      rkey: "3ab",
    });
    expect(
      parseBskyClientUrl(
        "https://witchsky.app/profile/did:plc:vpkhqolt662u/feed/infreq",
      ),
    ).toEqual({
      host: "witchsky.app",
      ident: "did:plc:vpkhqolt662u",
      kind: "feed",
      rkey: "infreq",
    });
    // `social-app` spells the list route `/lists/`, not `/list/`.
    expect(
      parseBskyClientUrl(
        "https://bsky.app/profile/alice.bsky.social/lists/xyz",
      ),
    ).toEqual({
      host: "bsky.app",
      ident: "alice.bsky.social",
      kind: "list",
      rkey: "xyz",
    });
    expect(
      parseBskyClientUrl(
        "https://bsky.app/starter-pack/alice.bsky.social/pack",
      ),
    ).toEqual({
      host: "bsky.app",
      ident: "alice.bsky.social",
      kind: "starterPack",
      rkey: "pack",
    });
  });

  it("tolerates trailing slashes, query strings, and `@`-prefixed handles", () => {
    expect(
      parseBskyClientUrl(
        "https://witchsky.app/profile/@alice.bsky.social/?x=1",
      ),
    ).toEqual({
      host: "witchsky.app",
      ident: "alice.bsky.social",
      kind: "profile",
    });
  });

  it("returns null for client pages that are not records", () => {
    expect(parseBskyClientUrl("https://witchsky.app/")).toBeNull();
    expect(parseBskyClientUrl("https://bsky.app/search?q=art")).toBeNull();
    expect(parseBskyClientUrl("https://bsky.app/settings")).toBeNull();
    // Not a handle (no dot) and not a DID — `social-app` reserves these.
    expect(parseBskyClientUrl("https://bsky.app/profile/me")).toBeNull();
    // Unknown sub-resource under a profile.
    expect(
      parseBskyClientUrl("https://bsky.app/profile/alice.bsky.social/likes"),
    ).toBeNull();
  });

  it("returns null for non-client URLs", () => {
    expect(
      parseBskyClientUrl("https://example.com/profile/alice.bsky.social"),
    ).toBeNull();
    expect(
      parseBskyClientUrl("at://did:plc:abc/app.bsky.feed.post/1"),
    ).toBeNull();
    expect(parseBskyClientUrl("")).toBeNull();
  });
});

describe("bskyClientRefAtUri", () => {
  it("builds the AT-URI for each record kind", () => {
    const ref = parseBskyClientUrl(
      "https://witchsky.app/profile/did:plc:vpk/feed/infreq",
    );
    expect(ref && bskyClientRefAtUri(ref)).toBe(
      "at://did:plc:vpk/app.bsky.feed.generator/infreq",
    );

    const list = parseBskyClientUrl(
      "https://mu.social/profile/did:plc:vpk/lists/abc",
    );
    expect(list && bskyClientRefAtUri(list)).toBe(
      "at://did:plc:vpk/app.bsky.graph.list/abc",
    );
  });

  it("returns null when the URL carried a handle instead of a DID", () => {
    const ref = parseBskyClientUrl(
      "https://bsky.app/profile/alice.bsky.social/post/3ab",
    );
    expect(ref && bskyClientRefAtUri(ref)).toBeNull();
  });

  it("returns null for a bare profile — there is no record to address", () => {
    const ref = parseBskyClientUrl("https://bsky.app/profile/did:plc:abc");
    expect(ref && bskyClientRefAtUri(ref)).toBeNull();
  });
});

describe("bskyClientProfileIdent", () => {
  it("returns the ident only for a bare profile", () => {
    expect(
      bskyClientProfileIdent("https://mu.social/profile/alice.bsky.social"),
    ).toBe("alice.bsky.social");
    expect(
      bskyClientProfileIdent(
        "https://mu.social/profile/alice.bsky.social/post/3ab",
      ),
    ).toBeNull();
  });
});
