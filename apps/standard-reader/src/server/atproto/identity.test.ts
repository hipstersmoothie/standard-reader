import { afterEach, describe, expect, it, vi } from "vitest";

import { INVALID_HANDLE, isUsableHandle, resolveIdentity } from "./identity";

function mockDidDoc(serviceEndpoint: unknown) {
  return {
    ok: true,
    json: async () => ({
      service: [
        {
          id: "#atproto_pds",
          type: "AtprotoPersonalDataServer",
          serviceEndpoint,
        },
      ],
    }),
  } as Response;
}

describe("resolveIdentity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a well-formed https serviceEndpoint as the PDS", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockDidDoc("https://pds.example.com")),
    );
    const identity = await resolveIdentity("did:plc:well-formed-pds");
    expect(identity.pds).toBe("https://pds.example.com");
  });

  // A malformed `serviceEndpoint` in the DID document previously reached an
  // unguarded `new URL(path, host)` downstream and threw an uncaught
  // TypeError that crashed repo reconcile for that DID on every tick.
  it.each([
    ["missing scheme", "pds.example.com"],
    ["empty string", ""],
    ["not a URL at all", "not-a-url"],
    ["wrong scheme", "ftp://pds.example.com"],
  ])("returns pds: null for a %s serviceEndpoint (%s)", async (_desc, ep) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockDidDoc(ep)));
    const identity = await resolveIdentity(
      `did:plc:malformed-${ep || "empty"}`,
    );
    expect(identity.pds).toBeNull();
  });
});

describe("isUsableHandle", () => {
  it("accepts a real handle", () => {
    expect(isUsableHandle("qxm.de")).toBe(true);
    expect(isUsableHandle("alice.bsky.social")).toBe(true);
  });

  it("rejects the handle.invalid sentinel, empty, and nullish values", () => {
    const missing: string | undefined = undefined;
    expect(isUsableHandle(INVALID_HANDLE)).toBe(false);
    expect(isUsableHandle("handle.invalid")).toBe(false);
    expect(isUsableHandle("")).toBe(false);
    expect(isUsableHandle(null)).toBe(false);
    expect(isUsableHandle(missing)).toBe(false);
  });
});
