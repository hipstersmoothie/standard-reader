import { describe, expect, it } from "vitest";

import { cdnImageUrl, bskyImageUrl } from "#/server/atproto/blob";

import {
  DEFAULT_IMAGE_CDN,
  IMAGE_CDN_HOSTS,
  IMAGE_CDN_IDS,
  dbValueToImageCdn,
  imageCdnToDbValue,
  isImageCdnId,
  parseImageCdn,
  rewriteImageCdnUrl,
} from "./image-cdn";

const DID = "did:plc:z72i7hdynmk6r22z27h6tvur";
const CID = "bafkreihwihm6kpd6zuwhhlro75p5qks5qtrcu55jp3gddbfjsieiv7wuka";

describe("rewriteImageCdnUrl", () => {
  it("leaves URLs alone on the default host", () => {
    const url = cdnImageUrl(DID, CID, "png");
    expect(rewriteImageCdnUrl(url, "bsky")).toBe(url);
  });

  it("moves server-built blob URLs onto the chosen host, keeping the path", () => {
    expect(rewriteImageCdnUrl(cdnImageUrl(DID, CID, "png"), "porxie")).toBe(
      `https://porxie-bsky.dollware.net/img/feed_fullsize/plain/${encodeURIComponent(
        DID,
      )}/${CID}@png`,
    );
    expect(rewriteImageCdnUrl(bskyImageUrl("avatar", DID, CID), "luna")).toBe(
      `https://luna.danielmorrisey.com/img/avatar/plain/${DID}/${CID}@jpeg`,
    );
  });

  it("covers every offered host", () => {
    for (const id of IMAGE_CDN_IDS) {
      const rewritten = rewriteImageCdnUrl(cdnImageUrl(DID, CID), id);
      expect(rewritten.startsWith(`${IMAGE_CDN_HOSTS[id].origin}/img/`)).toBe(
        true,
      );
    }
  });

  it("never touches other hosts, non-image paths, or local URLs", () => {
    for (const url of [
      "https://example.com/cover.png",
      // Same host, but not the `/img/` image service.
      "https://cdn.bsky.app/static/logo.png",
      // A look-alike host must not match the prefix.
      "https://cdn.bsky.app.evil.test/img/feed_fullsize/plain/x/y@jpeg",
      "/brand/pckt-wordmark-outline.svg",
      "blob:https://standard-reader.app/1234",
      "data:image/png;base64,AAAA",
    ]) {
      expect(rewriteImageCdnUrl(url, "porxie")).toBe(url);
    }
  });

  it("is idempotent, so a URL can pass through it more than once", () => {
    const once = rewriteImageCdnUrl(cdnImageUrl(DID, CID), "blueat");
    expect(rewriteImageCdnUrl(once, "blueat")).toBe(once);
  });

  it("passes empty values through", () => {
    expect(rewriteImageCdnUrl(null, "porxie")).toBeNull();
    expect(rewriteImageCdnUrl(undefined, "porxie")).toBeUndefined();
    expect(rewriteImageCdnUrl("", "porxie")).toBe("");
  });
});

describe("stored values", () => {
  it("only accepts the vetted ids", () => {
    expect(isImageCdnId("porxie")).toBe(true);
    expect(isImageCdnId("https://evil.test")).toBe(false);
    expect(parseImageCdn("https://evil.test")).toBe(DEFAULT_IMAGE_CDN);
    expect(parseImageCdn(null)).toBe(DEFAULT_IMAGE_CDN);
    expect(parseImageCdn("luna")).toBe("luna");
  });

  it("stores the default as null and round-trips the rest", () => {
    expect(imageCdnToDbValue("bsky")).toBeNull();
    expect(dbValueToImageCdn(null)).toBe("bsky");
    for (const id of IMAGE_CDN_IDS) {
      expect(dbValueToImageCdn(imageCdnToDbValue(id))).toBe(id);
    }
  });
});
