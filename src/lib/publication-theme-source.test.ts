import { describe, expect, it } from "vitest";

import { resolvePublicationTheme } from "./publication-theme-source";

/** `site.standard.theme.basic` as every publisher writes it (0–255 channels). */
const BASIC_THEME = {
  $type: "site.standard.theme.basic",
  background: { r: 253, g: 252, b: 250 },
  foreground: { r: 39, g: 39, b: 39 },
  accent: { r: 43, g: 82, b: 255 },
  accentForeground: { r: 255, g: 255, b: 255 },
};

describe("resolvePublicationTheme", () => {
  it("falls back to basicTheme when there is no native theme", () => {
    const theme = resolvePublicationTheme(BASIC_THEME, null);
    expect(theme.light).toEqual({
      background: "#fdfcfa",
      foreground: "#272727",
      accent: "#2b52ff",
      accentForeground: "#ffffff",
      // The baseline states no scale steps, so they stay derived.
      surface: null,
      surfaceHover: null,
      border: null,
      link: null,
      neutral: null,
      secondary: null,
    });
    expect(theme.dark).toBeNull();
  });

  it("falls back to basicTheme for an unknown platform $type", () => {
    const theme = resolvePublicationTheme(BASIC_THEME, {
      $type: "com.example.someFutureTheme",
      background: { r: 1, g: 2, b: 3 },
    });
    expect(theme.light.background).toBe("#fdfcfa");
  });

  describe("pub.leaflet.publication#theme", () => {
    // Real shape from at://did:plc:pqerwmnouevyltxyoayhholf/…/3m52m2q72qs2a
    const LEAFLET = {
      $type: "pub.leaflet.publication#theme",
      backgroundColor: { $type: "…#rgba", r: 253, g: 252, b: 250, a: 100 },
      pageBackground: { $type: "…#rgba", r: 224, g: 239, b: 255, a: 95 },
      showPageBackground: true,
      primary: { r: 39, g: 39, b: 39 },
      accentBackground: { r: 43, g: 82, b: 255 },
      accentText: { r: 255, g: 255, b: 255 },
    };

    it("uses the page surface, not the canvas, when showPageBackground is on", () => {
      const theme = resolvePublicationTheme(BASIC_THEME, LEAFLET);
      // basicTheme reports the canvas (#fdfcfa); the reader actually sees the
      // page background composited over it at 95% alpha.
      expect(theme.light.background).not.toBe("#fdfcfa");
      // 224,239,255 at 95% over the 253,252,250 canvas.
      expect(theme.light.background).toBe("#e1f0ff");
    });

    it("uses the canvas when showPageBackground is off", () => {
      const theme = resolvePublicationTheme(BASIC_THEME, {
        ...LEAFLET,
        showPageBackground: false,
      });
      expect(theme.light.background).toBe("#fdfcfa");
    });

    it("maps primary/accent and derives no dark palette", () => {
      const theme = resolvePublicationTheme(BASIC_THEME, LEAFLET);
      expect(theme.light.foreground).toBe("#272727");
      expect(theme.light.accent).toBe("#2b52ff");
      expect(theme.light.accentForeground).toBe("#ffffff");
      expect(theme.dark).toBeNull();
    });
  });

  describe("blog.pckt.theme", () => {
    // Real shape from at://did:plc:v46ojbiop5ebs5h7gaomixcc/…/3m57zfsq3a2fo
    const PCKT = {
      $type: "blog.pckt.theme",
      light: {
        background: "#ecfdf5",
        text: "#064e3b",
        accent: "#65a30d",
        link: "#0d9488",
        surfaceHover: "#a7f3d0",
      },
      dark: {
        background: "#022c22",
        text: "#d1fae5",
        accent: "#84cc16",
        link: "#5eead4",
        surfaceHover: "#064e3b",
      },
    };

    it("uses the authored light palette", () => {
      const theme = resolvePublicationTheme(BASIC_THEME, PCKT);
      expect(theme.light.background).toBe("#ecfdf5");
      expect(theme.light.foreground).toBe("#064e3b");
      expect(theme.light.accent).toBe("#65a30d");
    });

    it("surfaces the authored dark palette instead of deriving one", () => {
      const theme = resolvePublicationTheme(BASIC_THEME, PCKT);
      expect(theme.dark).toStrictEqual({
        background: "#022c22",
        foreground: "#d1fae5",
        accent: "#84cc16",
        // PCKT authors no accent-foreground; the scale generator picks a
        // WCAG-safe one against the accent.
        accentForeground: null,
        // A hover fill anchors the hover step, not the resting surface.
        surface: null,
        surfaceHover: "#064e3b",
        border: null,
        // PCKT always states a link colour, distinct from the accent.
        link: "#5eead4",
        neutral: null,
        secondary: null,
      });
    });
  });

  describe("app.offprint.theme", () => {
    const OFFPRINT_LIGHT = {
      $type: "app.offprint.theme",
      colorScheme: "light",
      colors: {
        base100: { r: 255, g: 255, b: 255 },
        base200: { r: 250, g: 250, b: 250 },
        base300: { r: 229, g: 229, b: 229 },
        baseContent: { r: 13, g: 13, b: 13 },
        primary: { r: 13, g: 13, b: 13 },
        primaryContent: { r: 250, g: 250, b: 250 },
      },
    };

    it("maps base100/baseContent/primary and the base200/300 scale steps", () => {
      const theme = resolvePublicationTheme(BASIC_THEME, OFFPRINT_LIGHT);
      expect(theme.light).toEqual({
        background: "#ffffff",
        foreground: "#0d0d0d",
        accent: "#0d0d0d",
        accentForeground: "#fafafa",
        surface: "#fafafa",
        surfaceHover: null,
        border: "#e5e5e5",
        link: null,
        neutral: null,
        secondary: null,
      });
      expect(theme.dark).toBeNull();
    });

    it("slots a dark-scheme theme as the dark palette, leaving light on basicTheme", () => {
      const theme = resolvePublicationTheme(BASIC_THEME, {
        ...OFFPRINT_LIGHT,
        colorScheme: "dark",
        colors: {
          base100: { r: 2, g: 44, b: 34 },
          baseContent: { r: 209, g: 250, b: 229 },
          primary: { r: 132, g: 204, b: 22 },
          primaryContent: { r: 0, g: 0, b: 0 },
        },
      });
      expect(theme.light.background).toBe("#fdfcfa");
      expect(theme.dark?.background).toBe("#022c22");
      expect(theme.dark?.accent).toBe("#84cc16");
    });
  });
});
