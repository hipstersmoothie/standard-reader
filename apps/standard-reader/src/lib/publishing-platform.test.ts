import { describe, expect, it } from "vitest";

import { publishingPlatform } from "./publishing-platform";

describe("publishingPlatform", () => {
  it("identifies each platform from its content format", () => {
    expect(publishingPlatform({ contentFormat: "pub.leaflet.content" })).toBe(
      "leaflet",
    );
    expect(publishingPlatform({ contentFormat: "pub.leaflet.document" })).toBe(
      "leaflet",
    );
    expect(publishingPlatform({ contentFormat: "app.offprint.content" })).toBe(
      "offprint",
    );
    expect(publishingPlatform({ contentFormat: "blog.pckt.content" })).toBe(
      "pckt",
    );
  });

  it("matches any lexicon under the pckt authority", () => {
    expect(
      publishingPlatform({ contentFormat: "blog.pckt.richtext.facet#bold" }),
    ).toBe("pckt");
  });

  it("does not mistake a lookalike NSID for pckt", () => {
    expect(publishingPlatform({ contentFormat: "blog.pcktfake.content" })).toBe(
      null,
    );
  });

  it("falls back to the host when the content format is unknown", () => {
    expect(
      publishingPlatform({ canonicalUrl: "https://leaflet.pub/3m4qgpc7h3223" }),
    ).toBe("leaflet");
    expect(
      publishingPlatform({
        canonicalUrl: "https://lab.leaflet.pub/3lxy5sg373k2z",
      }),
    ).toBe("leaflet");
    expect(
      publishingPlatform({ canonicalUrl: "https://devlog.pckt.blog/a-post" }),
    ).toBe("pckt");
    expect(
      publishingPlatform({
        canonicalUrl: "https://tynanistyping.offprint.app/a/3mcs-slug",
      }),
    ).toBe("offprint");
  });

  it("prefers the content format over the host, so custom domains still resolve", () => {
    expect(
      publishingPlatform({
        contentFormat: "pub.leaflet.content",
        canonicalUrl: "https://notes.example.com/a-post",
      }),
    ).toBe("leaflet");
  });

  it("does not treat offprint.net as Offprint", () => {
    // offprint.net redirects to offprint.cafe, an unrelated product.
    expect(
      publishingPlatform({ canonicalUrl: "https://offprint.net/some-story" }),
    ).toBe(null);
  });

  it("does not match a host that merely ends with a platform domain", () => {
    expect(
      publishingPlatform({ canonicalUrl: "https://notleaflet.pub/post" }),
    ).toBe(null);
  });

  it("returns null for unknown sources and malformed URLs", () => {
    expect(publishingPlatform({})).toBe(null);
    expect(
      publishingPlatform({ contentFormat: null, canonicalUrl: null }),
    ).toBe(null);
    expect(publishingPlatform({ canonicalUrl: "not a url" })).toBe(null);
    expect(
      publishingPlatform({ canonicalUrl: "https://example.com/post" }),
    ).toBe(null);
  });
});
