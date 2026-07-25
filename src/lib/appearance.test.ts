import { describe, expect, it } from "vitest";

import type { AppearancePreference } from "./appearance";
import {
  DEFAULT_APPEARANCE,
  TEXT_SIZE_SCALE,
  appearanceIsDefault,
  appearanceScaleVars,
  appearanceScheme,
  appearanceThemeColor,
  appearanceToCookieValue,
  appearanceToDbValue,
  dbValueToAppearance,
  normalizeAppearance,
  normalizeHexColor,
  parseAppearanceCookie,
} from "./appearance";
import { parseReadingTypographyCookie } from "./reading-typography";

const CUSTOM: AppearancePreference = {
  palette: "custom",
  customPaper: "#1b1512",
  customAccent: "#e0703a",
  font: "custom",
  customFontFamily: "Playfair Display",
  textSize: "xl",
  roundness: "sharp",
  density: "compact",
};

describe("appearance cookie encoding", () => {
  it("round-trips every field", () => {
    expect(parseAppearanceCookie(appearanceToCookieValue(CUSTOM))).toEqual(
      CUSTOM,
    );
  });

  it("round-trips a curated palette", () => {
    const preference = { ...DEFAULT_APPEARANCE, palette: "tide" } as const;
    expect(parseAppearanceCookie(appearanceToCookieValue(preference))).toEqual(
      preference,
    );
  });

  /**
   * `Set-Cookie` percent-encodes the value, so the string handed back on the
   * next request has `%3A` where we wrote `:`. Parsing that as-is silently
   * returned the defaults, wiping the reader's palette on every load.
   */
  it("parses the percent-encoded form the browser returns", () => {
    const encoded = encodeURIComponent(appearanceToCookieValue(CUSTOM));
    expect(encoded).not.toBe(appearanceToCookieValue(CUSTOM));
    expect(parseAppearanceCookie(encoded)).toEqual(CUSTOM);
  });

  it("falls back to defaults for junk", () => {
    expect(parseAppearanceCookie("")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearanceCookie("nonsense")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearanceCookie(null)).toEqual(DEFAULT_APPEARANCE);
  });

  it("drops retired option values", () => {
    // `round` was removed once squircles made it indistinguishable from default.
    expect(
      parseAppearanceCookie("almanac:-:-:editorial:-:default:round:default")
        .roundness,
    ).toBe("default");
  });
});

describe("normalization", () => {
  it("drops colors that a curated palette doesn't use", () => {
    const normalized = normalizeAppearance({
      ...CUSTOM,
      palette: "meadow",
    });
    expect(normalized.customPaper).toBeUndefined();
    expect(normalized.customAccent).toBeUndefined();
  });

  it("drops the family when the font isn't custom", () => {
    const normalized = normalizeAppearance({ ...CUSTOM, font: "sans" });
    expect(normalized.customFontFamily).toBeUndefined();
  });

  it("falls back to the editorial stack when the family is unusable", () => {
    const normalized = normalizeAppearance({
      ...CUSTOM,
      customFontFamily: "  ",
    });
    expect(normalized.font).toBe("editorial");
  });

  it("fills in default colors for a custom palette", () => {
    const normalized = normalizeAppearance({
      ...DEFAULT_APPEARANCE,
      palette: "custom",
    });
    expect(normalized.customPaper).toBeDefined();
    expect(normalized.customAccent).toBeDefined();
  });
});

describe("normalizeHexColor", () => {
  it("accepts the forms a color input can produce", () => {
    expect(normalizeHexColor("#AABBCC")).toBe("#aabbcc");
    expect(normalizeHexColor("aabbcc")).toBe("#aabbcc");
    expect(normalizeHexColor("#abc")).toBe("#aabbcc");
    expect(normalizeHexColor(" #AbC ")).toBe("#aabbcc");
  });

  it("rejects anything else", () => {
    expect(normalizeHexColor("rgb(1,2,3)")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor(42)).toBeNull();
  });
});

describe("scheme", () => {
  it("takes a curated palette's stated scheme", () => {
    expect(appearanceScheme({ ...DEFAULT_APPEARANCE, palette: "meadow" })).toBe(
      "light",
    );
    expect(appearanceScheme({ ...DEFAULT_APPEARANCE, palette: "tide" })).toBe(
      "dark",
    );
  });

  it("derives a custom palette's scheme from the paper", () => {
    expect(appearanceScheme(CUSTOM)).toBe("dark");
    expect(appearanceScheme({ ...CUSTOM, customPaper: "#fdfcf8" })).toBe(
      "light",
    );
  });

  it("reports the palette's own page color for the title bar", () => {
    expect(appearanceThemeColor(CUSTOM)).toBe("#1b1512");
    expect(
      appearanceThemeColor({ ...DEFAULT_APPEARANCE, palette: "tide" }),
    ).toBe("#111113");
  });
});

describe("scale vars", () => {
  it("emits nothing at the defaults, so untouched readers render as before", () => {
    expect(appearanceScaleVars(DEFAULT_APPEARANCE)).toEqual({});
  });

  it("emits only the dials that moved", () => {
    const vars = appearanceScaleVars({
      ...DEFAULT_APPEARANCE,
      textSize: "large",
    });
    expect(vars).toEqual({
      "--sr-text-scale": TEXT_SIZE_SCALE.large,
    });
  });

  it("quotes a custom family so it can carry spaces", () => {
    expect(appearanceScaleVars(CUSTOM)["--sr-ui-font"]).toBe(
      "'Playfair Display'",
    );
  });
});

describe("db value", () => {
  it("stores null for the defaults", () => {
    expect(appearanceToDbValue(DEFAULT_APPEARANCE)).toBeNull();
    expect(dbValueToAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });

  it("round-trips a customized preference", () => {
    const stored = appearanceToDbValue(CUSTOM);
    expect(stored).not.toBeNull();
    expect(dbValueToAppearance(stored)).toEqual(CUSTOM);
  });

  it("knows when a preference is untouched", () => {
    expect(appearanceIsDefault(DEFAULT_APPEARANCE)).toBe(true);
    expect(appearanceIsDefault(CUSTOM)).toBe(false);
  });
});

describe("reading typography cookie", () => {
  /** Same percent-encoding bug as the appearance cookie — regression guard. */
  it("parses the percent-encoded form the browser returns", () => {
    expect(parseReadingTypographyCookie("large%3Awide%3Asans")).toEqual({
      fontSize: "large",
      measure: "wide",
      bodyFont: "sans",
      customFontFamily: undefined,
    });
  });
});
