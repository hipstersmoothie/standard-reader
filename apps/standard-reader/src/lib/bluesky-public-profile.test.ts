import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchBlueskyPublicProfileFields,
  shouldApplyBlueskyAvatarFromPublicUrl,
} from "./bluesky-public-profile";

function mockProfile(body: Record<string, unknown>) {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

describe("fetchBlueskyPublicProfileFields", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a verified handle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockProfile({ handle: "qxm.de" })),
    );
    const fields = await fetchBlueskyPublicProfileFields("did:plc:x");
    expect(fields?.handle).toBe("qxm.de");
  });

  // Bluesky returns the `handle.invalid` sentinel for an unverified handle;
  // it must never surface as a usable handle (issue #4).
  it("drops the handle.invalid sentinel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockProfile({ handle: "handle.invalid" })),
    );
    const fields = await fetchBlueskyPublicProfileFields("did:plc:x");
    expect(fields?.handle).toBeNull();
  });
});

describe("shouldApplyBlueskyAvatarFromPublicUrl", () => {
  const a = "https://cdn.bsky.app/img/avatar/plain/did:plc:x/bafkreia";
  const b = "https://cdn.bsky.app/img/avatar/plain/did:plc:x/bafkreib";

  it("seeds an account that has no avatar yet", () => {
    expect(shouldApplyBlueskyAvatarFromPublicUrl(null, a)).toBe(true);
    expect(shouldApplyBlueskyAvatarFromPublicUrl("", a)).toBe(true);
  });

  // The stored copy used to be written once and never revisited, so a reader
  // who changed their picture kept the old one in the sidebar forever.
  it("adopts a changed Bluesky avatar", () => {
    expect(shouldApplyBlueskyAvatarFromPublicUrl(a, b)).toBe(true);
  });

  it("leaves an unchanged avatar alone", () => {
    expect(shouldApplyBlueskyAvatarFromPublicUrl(a, a)).toBe(false);
  });

  it("never clobbers an inlined image with an upstream URL", () => {
    expect(
      shouldApplyBlueskyAvatarFromPublicUrl("data:image/png;base64,AAA", a),
    ).toBe(false);
  });

  it("ignores a missing upstream avatar", () => {
    expect(shouldApplyBlueskyAvatarFromPublicUrl(a, null)).toBe(false);
    expect(shouldApplyBlueskyAvatarFromPublicUrl(a, "  ")).toBe(false);
  });
});
