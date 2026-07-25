import { describe, expect, it } from "vitest";

import {
  hasPublicationFonts,
  normalizeFontKey,
  publicationFontRequests,
  publicationFontsHref,
  resolvePublicationFonts,
} from "./publication-fonts";

/**
 * Stands in for the Google Fonts catalog index. Entries are real families,
 * keyed the way `normalizeFontKey` produces.
 */
const CATALOG = new Map([
  ["dmsans", "DM Sans"],
  ["jetbrainsmono", "JetBrains Mono"],
  ["sourceserif4", "Source Serif 4"],
  ["spacemono", "Space Mono"],
  ["ibmplexserif", "IBM Plex Serif"],
  ["lora", "Lora"],
  ["montserrat", "Montserrat"],
]);
const lookup = (key: string) => CATALOG.get(key) ?? null;

describe("publicationFontRequests", () => {
  it("reads Offprint's heading/body slugs", () => {
    expect(
      publicationFontRequests({
        $type: "app.offprint.theme",
        typography: { headingFont: "playfair-display", bodyFont: "dm-sans" },
      }),
    ).toEqual({
      heading: { family: null, key: "playfair-display" },
      body: { family: null, key: "dm-sans" },
    });
  });

  it("uses PCKT's single font for both heading and body", () => {
    const requests = publicationFontRequests({
      $type: "blog.pckt.theme",
      font: "spacemono",
    });
    expect(requests.heading).toEqual({ family: null, key: "spacemono" });
    expect(requests.body).toEqual(requests.heading);
  });

  it("takes the family straight out of Leaflet's `custom:` form", () => {
    const requests = publicationFontRequests({
      $type: "pub.leaflet.publication#theme",
      headingFont: "custom:Source Serif 4:Source+Serif+4:ital,wght@0,400;0,700",
      bodyFont: "montserrat",
    });
    // Family is stated outright — no catalog lookup required.
    expect(requests.heading).toEqual({ family: "Source Serif 4", key: null });
    expect(requests.body).toEqual({ family: null, key: "montserrat" });
  });

  it("returns nothing for an unknown platform or a missing theme", () => {
    expect(publicationFontRequests({ $type: "com.example.theme" })).toEqual({
      heading: null,
      body: null,
    });
    expect(publicationFontRequests(null)).toEqual({
      heading: null,
      body: null,
    });
  });
});

describe("resolvePublicationFonts", () => {
  it("normalizes slugs and squashed keys onto catalog families", () => {
    expect(
      resolvePublicationFonts(
        publicationFontRequests({
          $type: "app.offprint.theme",
          typography: { headingFont: "jetbrains-mono", bodyFont: "dm-sans" },
        }),
        lookup,
      ),
    ).toEqual({ heading: "JetBrains Mono", body: "DM Sans" });

    expect(
      resolvePublicationFonts(
        publicationFontRequests({
          $type: "blog.pckt.theme",
          font: "ibmplexserif",
        }),
        lookup,
      ),
    ).toEqual({ heading: "IBM Plex Serif", body: "IBM Plex Serif" });
  });

  it("applies the alias table for keys that don't normalize onto a family", () => {
    // `source-sans` predates Adobe's rename to Source Sans 3.
    const fonts = resolvePublicationFonts(
      publicationFontRequests({
        $type: "pub.leaflet.publication#theme",
        bodyFont: "source-sans",
      }),
      lookup,
    );
    expect(fonts.body).toBe("Source Sans 3");
  });

  it("leaves platform defaults and non-Google faces unresolved", () => {
    // PCKT `legible` is a generic slot, Leaflet `quattro` is iA Writer — both
    // must fall through so the reader keeps their own typography.
    for (const key of ["legible", "sans", "quattro", "iawritermono"]) {
      const fonts = resolvePublicationFonts(
        publicationFontRequests({ $type: "blog.pckt.theme", font: key }),
        lookup,
      );
      expect(fonts).toEqual({ heading: null, body: null });
      expect(hasPublicationFonts(fonts)).toBe(false);
    }
  });
});

describe("publicationFontsHref", () => {
  it("builds a CSS2 URL with no weight axis and no duplicates", () => {
    expect(publicationFontsHref({ heading: "DM Sans", body: "DM Sans" })).toBe(
      "https://fonts.googleapis.com/css2?family=DM+Sans&display=swap",
    );
    expect(
      publicationFontsHref({ heading: "Source Serif 4", body: "Lora" }),
    ).toBe(
      "https://fonts.googleapis.com/css2?family=Source+Serif+4&family=Lora&display=swap",
    );
  });

  it("is null when nothing resolved", () => {
    expect(publicationFontsHref({ heading: null, body: null })).toBeNull();
    expect(publicationFontsHref(null)).toBeNull();
  });
});

describe("normalizeFontKey", () => {
  it("collapses separators and case", () => {
    expect(normalizeFontKey("DM Sans")).toBe("dmsans");
    expect(normalizeFontKey("dm-sans")).toBe("dmsans");
    expect(normalizeFontKey("Source Serif 4")).toBe("sourceserif4");
  });
});
