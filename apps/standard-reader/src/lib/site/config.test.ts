import { describe, expect, it } from "vitest";

import {
  DEFAULT_SITE_CONFIG,
  normalizeHexColor,
  normalizeSiteLinks,
  normalizeSiteTheme,
  siteConfigFromRow,
} from "./config";
import { DEFAULT_SITE_STYLE, isSiteStyle, toSiteStyle } from "./styles";
import { authorSitePath, publicationSitePath } from "./url";

describe("toSiteStyle", () => {
  it("keeps a style this build knows", () => {
    expect(toSiteStyle("journal")).toBe("journal");
  });

  it("falls back for a style written by a newer client", () => {
    expect(toSiteStyle("hypercard")).toBe(DEFAULT_SITE_STYLE);
    expect(toSiteStyle()).toBe(DEFAULT_SITE_STYLE);
    expect(toSiteStyle(7)).toBe(DEFAULT_SITE_STYLE);
  });

  it("narrows only known values", () => {
    expect(isSiteStyle("gallery")).toBe(true);
    expect(isSiteStyle("Gallery")).toBe(false);
  });
});

describe("normalizeHexColor", () => {
  it("accepts both hex lengths, case-insensitively", () => {
    expect(normalizeHexColor("#FFF")).toBe("#fff");
    expect(normalizeHexColor(" #A1B2C3 ")).toBe("#a1b2c3");
  });

  it("rejects anything the scale generator couldn't parse", () => {
    expect(normalizeHexColor("rebeccapurple")).toBeNull();
    expect(normalizeHexColor("rgb(1,2,3)")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor(null)).toBeNull();
  });
});

describe("normalizeSiteTheme", () => {
  it("keeps a partially stated theme", () => {
    expect(normalizeSiteTheme({ background: "#fff" })).toEqual({
      background: "#fff",
      foreground: null,
      accent: null,
      accentForeground: null,
    });
  });

  it("is null when nothing usable was stated, so the site inherits", () => {
    expect(normalizeSiteTheme({})).toBeNull();
    expect(normalizeSiteTheme({ accent: "not a color" })).toBeNull();
    expect(normalizeSiteTheme(null)).toBeNull();
  });
});

describe("normalizeSiteLinks", () => {
  it("keeps well-formed links, in order", () => {
    expect(
      normalizeSiteLinks([
        { label: " Newsletter ", url: "https://example.com/news" },
        { label: "Shop", url: "http://example.com/shop" },
      ]),
    ).toEqual([
      { label: "Newsletter", url: "https://example.com/news" },
      { label: "Shop", url: "http://example.com/shop" },
    ]);
  });

  it("drops half-filled rows", () => {
    expect(
      normalizeSiteLinks([
        { label: "", url: "https://example.com" },
        { label: "Nowhere", url: "" },
      ]),
    ).toEqual([]);
  });

  it("drops schemes a link must never carry onto a rendered page", () => {
    expect(
      normalizeSiteLinks([
        { label: "Tap", url: "javascript:alert(1)" },
        { label: "Mail", url: "mailto:someone@example.com" },
        { label: "Data", url: "data:text/html,<script>" },
      ]),
    ).toEqual([]);
  });

  it("caps the list at the lexicon's maximum", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      label: `Link ${index}`,
      url: `https://example.com/${index}`,
    }));
    expect(normalizeSiteLinks(many)).toHaveLength(8);
  });

  it("survives a row shape that isn't a link at all", () => {
    expect(normalizeSiteLinks(["nope", null, 3])).toEqual([]);
    expect(normalizeSiteLinks("not an array")).toEqual([]);
  });
});

describe("siteConfigFromRow", () => {
  const row = {
    style: "marquee",
    tagline: "  Essays and other trouble  ",
    themeBackground: "#101014",
    themeForeground: "#f5f5f0",
    themeAccent: null,
    themeAccentForeground: null,
    links: [{ label: "Home", url: "https://example.com" }],
    showStandardReaderLink: false,
  };

  it("reads a configured row", () => {
    expect(siteConfigFromRow(row)).toEqual({
      style: "marquee",
      tagline: "Essays and other trouble",
      theme: {
        background: "#101014",
        foreground: "#f5f5f0",
        accent: null,
        accentForeground: null,
      },
      links: [{ label: "Home", url: "https://example.com" }],
      showStandardReaderLink: false,
      configured: true,
    });
  });

  it("treats an empty tagline as absent, so the description shows instead", () => {
    expect(siteConfigFromRow({ ...row, tagline: "   " }).tagline).toBeNull();
  });

  it("keeps the colophon on unless the row says otherwise", () => {
    expect(
      siteConfigFromRow({ ...row, showStandardReaderLink: null })
        .showStandardReaderLink,
    ).toBe(true);
  });

  it("marks an unconfigured site as such, so the editor can offer a reset", () => {
    expect(DEFAULT_SITE_CONFIG.configured).toBe(false);
    expect(siteConfigFromRow(row).configured).toBe(true);
  });
});

describe("site paths", () => {
  it("mirror the in-app profile routes one segment deeper", () => {
    expect(authorSitePath("did:plc:abc")).toBe("/site/u/did:plc:abc");
    expect(publicationSitePath("did:plc:abc", "3kx")).toBe(
      "/site/p/did:plc:abc/3kx",
    );
  });

  // A site URL is made to be copied and pasted; a `%3A` that survives one
  // re-encode comes back as `%253A` and no longer names a DID.
  it("leave the DID's colons alone but still encode the rest", () => {
    expect(publicationSitePath("did:plc:abc", "a/b?c")).toBe(
      "/site/p/did:plc:abc/a%2Fb%3Fc",
    );
  });
});
