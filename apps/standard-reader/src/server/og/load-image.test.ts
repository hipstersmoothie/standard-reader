import { afterEach, describe, expect, it, vi } from "vitest";

import { loadOgImage } from "./load-image.ts";

const NINE_MB = 9 * 1024 * 1024;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadOgImage", () => {
  it("inlines a normal-sized image as a data URL", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        }),
    );
    await expect(loadOgImage("https://example.com/a.png")).resolves.toBe(
      "data:image/png;base64,AQID",
    );
  });

  it("drops an image whose declared length is over the cap", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array(8), {
          headers: {
            "content-type": "image/png",
            "content-length": String(NINE_MB),
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadOgImage("https://example.com/a.png")).resolves.toBeNull();
  });

  it("drops an oversized body even without a content-length", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(NINE_MB));
              controller.close();
            },
          }),
          { headers: { "content-type": "image/jpeg" } },
        ),
    );
    await expect(loadOgImage("https://example.com/a.jpg")).resolves.toBeNull();
  });

  it("falls back to the Bluesky CDN when a getBlob original is too big", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.startsWith("https://cdn.bsky.app/")
        ? new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/png" },
          })
        : new Response(new Uint8Array(NINE_MB), {
            headers: { "content-type": "image/jpeg" },
          }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      loadOgImage(
        "https://pds.example/xrpc/com.atproto.sync.getBlob?did=did:plc:abc&cid=bafy",
      ),
    ).resolves.toBe("data:image/png;base64,AQID");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:abc/bafy@png",
      expect.anything(),
    );
  });
});
