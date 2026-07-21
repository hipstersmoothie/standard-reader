import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchBlueskyPublicProfileFields } from "./bluesky-public-profile";

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
