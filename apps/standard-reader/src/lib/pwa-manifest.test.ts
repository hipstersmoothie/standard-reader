import { describe, expect, it } from "vitest";

import { buildWebAppManifest } from "./pwa-manifest.ts";
import {
  DEFAULT_PWA_THEME_COLORS,
  PWA_BACKGROUND_COLOR_BY_SCHEME,
  THEME_COLOR_BY_SCHEME,
  formatPwaThemeCookie,
  parsePwaThemeCookie,
} from "./theme.ts";

describe("parsePwaThemeCookie", () => {
  it("reads the pair the client wrote", () => {
    const colors = {
      themeColor: THEME_COLOR_BY_SCHEME.dark,
      backgroundColor: PWA_BACKGROUND_COLOR_BY_SCHEME.dark,
    };
    expect(parsePwaThemeCookie(formatPwaThemeCookie(colors))).toEqual(colors);
  });

  it("decodes the percent-encoded `#` a Set-Cookie round trip leaves behind", () => {
    expect(parsePwaThemeCookie("%2328211d%7C%23110c08")).toEqual({
      themeColor: "#28211d",
      backgroundColor: "#110c08",
    });
  });

  it("carries a custom palette's paper through as both colors", () => {
    expect(parsePwaThemeCookie("#1b1512|#1b1512")).toEqual({
      themeColor: "#1b1512",
      backgroundColor: "#1b1512",
    });
  });

  it.each([
    ["missing", undefined],
    ["a non-string", 42],
    ["empty", ""],
    ["a lone color", "#28211d"],
    ["a non-hex color", "red|#110c08"],
    ["shorthand hex", "#fff|#000"],
    ["a malformed escape", "%E0%A4%A|#110c08"],
    ["an injected style", "#28211d|javascript:alert(1)"],
  ])("falls back to the light pair when the cookie is %s", (_label, value) => {
    expect(parsePwaThemeCookie(value)).toEqual(DEFAULT_PWA_THEME_COLORS);
  });
});

describe("buildWebAppManifest", () => {
  it("paints the manifest in the colors it is handed", () => {
    const manifest = buildWebAppManifest({
      themeColor: "#28211d",
      backgroundColor: "#110c08",
    });
    expect(manifest.theme_color).toBe("#28211d");
    expect(manifest.background_color).toBe("#110c08");
  });

  // Not just tidiness: Firefox on Android only adopts a re-fetched manifest
  // when its `start_url` matches the stored one (`ManifestUpdateFeature`), so
  // varying `start_url` per theme would make every themed manifest a silent
  // no-op for exactly the readers this exists for.
  it("keeps the app identity stable across themes so installs are not forked", () => {
    const light = buildWebAppManifest(DEFAULT_PWA_THEME_COLORS);
    const dark = buildWebAppManifest({
      themeColor: THEME_COLOR_BY_SCHEME.dark,
      backgroundColor: PWA_BACKGROUND_COLOR_BY_SCHEME.dark,
    });
    expect(dark.id).toBe(light.id);
    expect(dark.start_url).toBe(light.start_url);
    expect(dark.scope).toBe(light.scope);
    expect(dark.icons).toEqual(light.icons);
  });

  it("still describes an installable standalone app", () => {
    const manifest = buildWebAppManifest(DEFAULT_PWA_THEME_COLORS);
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).toBe("Standard Reader");
    // Installability needs a 192px and a 512px icon.
    expect(manifest.icons.map((icon) => icon.sizes)).toContain("192x192");
    expect(manifest.icons.map((icon) => icon.sizes)).toContain("512x512");
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(
      true,
    );
  });
});
