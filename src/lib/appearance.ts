/**
 * Appearance preferences shared types/helpers.
 *
 * Two independent things live here:
 *
 * 1. **Palette** — which colors the app wears when the theme mode is `custom`
 *    (see `#/lib/theme`). Either one of the curated pairs below or the reader's
 *    own accent + paper. A palette states its own light/dark identity: the paper
 *    color *is* the scheme, so a custom theme does not follow the OS.
 * 2. **Shape and type** — interface font, text size, roundness, density. These
 *    apply in every theme mode, not just `custom`, because they aren't color.
 *
 * Every numeric dial is a multiplier applied to the design-system token scales
 * (`--sr-*-scale`), so one setting moves the whole app *and* the article in
 * step. The Reading section's own controls still override the article on top of
 * this baseline.
 *
 * Persisted in the `standard-reader-appearance` cookie (SSR for everyone).
 * Signed-in readers also store the same compact encoding on `user.appearance`
 * (`null` = all defaults).
 */

import {
  isValidGoogleFontFamily,
  normalizeGoogleFontFamily,
} from "./google-fonts";
import type { ResolvedThemeScheme } from "./theme";

/** Source of truth for the palette ids — also the zod enum on the server fn. */
export const PALETTE_IDS = [
  "almanac",
  "meadow",
  "press",
  "ink",
  "almanacNight",
  "archive",
  "tide",
  "ember",
  "custom",
] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

export type AppearanceFont = "editorial" | "sans" | "custom";

export type AppearanceTextSize = "xs" | "small" | "default" | "large" | "xl";

export type AppearanceRoundness = "sharp" | "soft" | "default";

export type AppearanceDensity = "compact" | "default" | "relaxed";

export interface AppearancePreference {
  palette: PaletteId;
  /** Page color when `palette` is `custom`. Decides light vs dark. */
  customPaper?: string;
  /** Accent when `palette` is `custom`. */
  customAccent?: string;
  font: AppearanceFont;
  /** Google Font family when `font` is `custom`. */
  customFontFamily?: string;
  textSize: AppearanceTextSize;
  roundness: AppearanceRoundness;
  density: AppearanceDensity;
}

export const APPEARANCE_FONTS = ["editorial", "sans", "custom"] as const;
export const APPEARANCE_TEXT_SIZES = [
  "xs",
  "small",
  "default",
  "large",
  "xl",
] as const;
/**
 * No step above `default`: the design system draws its corners as squircles, and
 * past the default radius a squircle barely reads as rounder — the option looked
 * like it did nothing.
 */
export const APPEARANCE_ROUNDNESS = ["sharp", "soft", "default"] as const;
export const APPEARANCE_DENSITIES = ["compact", "default", "relaxed"] as const;

export const DEFAULT_APPEARANCE: AppearancePreference = {
  palette: "almanac",
  font: "editorial",
  textSize: "default",
  roundness: "default",
  density: "default",
};

/** Fallback colors for the custom palette — the app's own light paper + camel. */
export const DEFAULT_CUSTOM_PAPER = "#fcfaf5";
export const DEFAULT_CUSTOM_ACCENT = "#ad7f58";

export const APPEARANCE_COOKIE = "standard-reader-appearance";

export const APPEARANCE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * A curated palette: a Radix accent paired with the gray Radix recommends for
 * it, in one stated scheme. `paper` / `ink` / `accent` are the rendered scale's
 * own steps — used for the palette tile summary, the OG-safe title-bar color,
 * and nothing that needs sub-pixel accuracy (the tiles themselves wear the real
 * StyleX theme, so they can't drift from these).
 */
export interface PaletteMeta {
  id: Exclude<PaletteId, "custom">;
  /** Proper noun, deliberately not translated. */
  name: string;
  scheme: ResolvedThemeScheme;
  paper: string;
  ink: string;
  accent: string;
}

export const PALETTES: ReadonlyArray<PaletteMeta> = [
  {
    id: "almanac",
    name: "Almanac",
    scheme: "light",
    paper: "#fcfaf5",
    ink: "#251f1b",
    accent: "#ad7f58",
  },
  {
    id: "meadow",
    name: "Meadow",
    scheme: "light",
    paper: "#fbfdfc",
    ink: "#1a211e",
    accent: "#46a758",
  },
  {
    id: "press",
    name: "Press",
    scheme: "light",
    paper: "#fdfdfc",
    ink: "#21201c",
    accent: "#e54d2e",
  },
  {
    id: "ink",
    name: "Ink",
    scheme: "light",
    paper: "#fcfcfd",
    ink: "#1c2024",
    accent: "#3e63dd",
  },
  {
    id: "almanacNight",
    name: "Almanac Night",
    scheme: "dark",
    paper: "#110c08",
    ink: "#e8e4dd",
    accent: "#ad7f58",
  },
  {
    id: "archive",
    name: "Archive",
    scheme: "dark",
    paper: "#121113",
    ink: "#eeeef0",
    accent: "#ab4aba",
  },
  {
    id: "tide",
    name: "Tide",
    scheme: "dark",
    paper: "#111113",
    ink: "#edeef0",
    accent: "#12a594",
  },
  {
    id: "ember",
    name: "Ember",
    scheme: "dark",
    paper: "#111110",
    ink: "#eeeeec",
    accent: "#ffc53d",
  },
];

export function paletteMeta(id: PaletteId): PaletteMeta | null {
  return PALETTES.find((palette) => palette.id === id) ?? null;
}

/**
 * Multipliers applied to the design-system token scales.
 *
 * The steps span 14px → 24px of base interface text, which carries the article
 * body from 19px to 28px. The top of the range is deliberately a big jump: a
 * size control that only nudges reads as "nothing happened", and the readers who
 * reach for the largest step want it to actually be large.
 */
export const TEXT_SIZE_SCALE: Record<AppearanceTextSize, string> = {
  xs: "0.875",
  small: "0.9375",
  default: "1",
  large: "1.25",
  xl: "1.5",
};

export const ROUNDNESS_SCALE: Record<AppearanceRoundness, string> = {
  sharp: "0",
  soft: "0.5",
  default: "1",
};

/**
 * Spacing multipliers. Wider than they look: most of what a reader perceives as
 * "density" is the padding inside rows and the gaps between them, and ±15% of
 * that reads as no change at all.
 */
export const DENSITY_SCALE: Record<AppearanceDensity, string> = {
  compact: "0.75",
  default: "1",
  relaxed: "1.35",
};

export function isPaletteId(value: unknown): value is PaletteId {
  return (
    typeof value === "string" &&
    (PALETTE_IDS as ReadonlyArray<string>).includes(value)
  );
}

export function isAppearanceFont(value: unknown): value is AppearanceFont {
  return (
    typeof value === "string" &&
    (APPEARANCE_FONTS as ReadonlyArray<string>).includes(value)
  );
}

export function isAppearanceTextSize(
  value: unknown,
): value is AppearanceTextSize {
  return (
    typeof value === "string" &&
    (APPEARANCE_TEXT_SIZES as ReadonlyArray<string>).includes(value)
  );
}

export function isAppearanceRoundness(
  value: unknown,
): value is AppearanceRoundness {
  return (
    typeof value === "string" &&
    (APPEARANCE_ROUNDNESS as ReadonlyArray<string>).includes(value)
  );
}

export function isAppearanceDensity(
  value: unknown,
): value is AppearanceDensity {
  return (
    typeof value === "string" &&
    (APPEARANCE_DENSITIES as ReadonlyArray<string>).includes(value)
  );
}

const HEX_PATTERN = /^#[0-9a-f]{6}$/;

/** Normalize `#RGB` / `RRGGBB` / mixed case to `#rrggbb`, or `null`. */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  const bare = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  const expanded =
    bare.length === 3 ? [...bare].map((char) => char + char).join("") : bare;
  const hex = `#${expanded}`;
  return HEX_PATTERN.test(hex) ? hex : null;
}

function normalizeCustomFontFamily(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeGoogleFontFamily(value);
  return isValidGoogleFontFamily(normalized) ? normalized : undefined;
}

/**
 * Drop the fields the chosen options don't use, so two preferences that render
 * identically also encode identically (and a stale custom color can't leak back
 * when the reader returns to a curated palette).
 */
export function normalizeAppearance(
  preference: AppearancePreference,
): AppearancePreference {
  const palette = isPaletteId(preference.palette)
    ? preference.palette
    : DEFAULT_APPEARANCE.palette;
  const font = isAppearanceFont(preference.font)
    ? preference.font
    : DEFAULT_APPEARANCE.font;
  const customFontFamily =
    font === "custom"
      ? normalizeCustomFontFamily(preference.customFontFamily)
      : undefined;

  return {
    palette,
    customPaper:
      palette === "custom"
        ? (normalizeHexColor(preference.customPaper) ?? DEFAULT_CUSTOM_PAPER)
        : undefined,
    customAccent:
      palette === "custom"
        ? (normalizeHexColor(preference.customAccent) ?? DEFAULT_CUSTOM_ACCENT)
        : undefined,
    // A `custom` font with no resolvable family is just the editorial stack.
    font: font === "custom" && !customFontFamily ? "editorial" : font,
    customFontFamily,
    textSize: isAppearanceTextSize(preference.textSize)
      ? preference.textSize
      : DEFAULT_APPEARANCE.textSize,
    roundness: isAppearanceRoundness(preference.roundness)
      ? preference.roundness
      : DEFAULT_APPEARANCE.roundness,
    density: isAppearanceDensity(preference.density)
      ? preference.density
      : DEFAULT_APPEARANCE.density,
  };
}

const ENCODING_SEPARATOR = ":";
const EMPTY_FIELD = "-";

function encodeField(value: string | undefined): string {
  return value && value !== "" ? encodeURIComponent(value) : EMPTY_FIELD;
}

function decodeField(value: string | undefined): string | undefined {
  if (!value || value === EMPTY_FIELD) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/**
 * `palette:paper:accent:font:family:textSize:roundness:density`, hex colors
 * without their `#` so the value stays cookie-safe.
 */
export function appearanceToCookieValue(
  preference: AppearancePreference,
): string {
  const normalized = normalizeAppearance(preference);
  return [
    normalized.palette,
    encodeField(normalized.customPaper?.slice(1)),
    encodeField(normalized.customAccent?.slice(1)),
    normalized.font,
    encodeField(normalized.customFontFamily),
    normalized.textSize,
    normalized.roundness,
    normalized.density,
  ].join(ENCODING_SEPARATOR);
}

export function parseAppearanceCookie(value: unknown): AppearancePreference {
  if (typeof value !== "string" || value.trim() === "") {
    return DEFAULT_APPEARANCE;
  }

  // `Set-Cookie` percent-encodes the value, so what comes back over the wire is
  // `meadow%3A-%3A…` rather than the `:`-joined string we wrote. Decode once up
  // front — without this the separators never match and every guest silently
  // falls back to the defaults on their next page load.
  const decoded = value.includes("%") ? (decodeField(value) ?? value) : value;

  const [palette, paper, accent, font, family, textSize, roundness, density] =
    decoded.split(ENCODING_SEPARATOR);

  return normalizeAppearance({
    palette: isPaletteId(palette) ? palette : DEFAULT_APPEARANCE.palette,
    customPaper: normalizeHexColor(decodeField(paper)) ?? undefined,
    customAccent: normalizeHexColor(decodeField(accent)) ?? undefined,
    font: isAppearanceFont(font) ? font : DEFAULT_APPEARANCE.font,
    customFontFamily: decodeField(family),
    textSize: isAppearanceTextSize(textSize)
      ? textSize
      : DEFAULT_APPEARANCE.textSize,
    roundness: isAppearanceRoundness(roundness)
      ? roundness
      : DEFAULT_APPEARANCE.roundness,
    density: isAppearanceDensity(density)
      ? density
      : DEFAULT_APPEARANCE.density,
  });
}

export function appearanceIsDefault(preference: AppearancePreference): boolean {
  const normalized = normalizeAppearance(preference);
  return (
    normalized.palette === DEFAULT_APPEARANCE.palette &&
    normalized.font === DEFAULT_APPEARANCE.font &&
    normalized.textSize === DEFAULT_APPEARANCE.textSize &&
    normalized.roundness === DEFAULT_APPEARANCE.roundness &&
    normalized.density === DEFAULT_APPEARANCE.density
  );
}

export function appearanceToDbValue(
  preference: AppearancePreference,
): string | null {
  return appearanceIsDefault(preference)
    ? null
    : appearanceToCookieValue(preference);
}

export function dbValueToAppearance(
  value: string | null | undefined,
): AppearancePreference {
  return parseAppearanceCookie(value ?? "");
}

/** sRGB relative luminance (WCAG 2.1), for deciding a paper's scheme. */
function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255,
  ] as const;
  const [r, g, b] = channels.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.039_28 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The scheme a palette renders in. Curated palettes state theirs; a custom one
 * takes it from the paper the reader picked — pick a dark paper and the app
 * goes dark, which is the whole point of choosing your own page color.
 */
export function appearanceScheme(
  preference: AppearancePreference,
): ResolvedThemeScheme {
  const normalized = normalizeAppearance(preference);
  if (normalized.palette === "custom") {
    const paper = normalized.customPaper ?? DEFAULT_CUSTOM_PAPER;
    return relativeLuminance(paper) < 0.2 ? "dark" : "light";
  }
  return paletteMeta(normalized.palette)?.scheme ?? "light";
}

/** The browser/PWA title-bar color for a palette. */
export function appearanceThemeColor(preference: AppearancePreference): string {
  const normalized = normalizeAppearance(preference);
  if (normalized.palette === "custom") {
    return normalized.customPaper ?? DEFAULT_CUSTOM_PAPER;
  }
  return paletteMeta(normalized.palette)?.paper ?? DEFAULT_CUSTOM_PAPER;
}

/**
 * The `--sr-*-scale` custom properties for the numeric dials. Only non-default
 * dials emit a variable: readers on the defaults get no inline style at all,
 * and the `calc()`s in `appearance-themes.ts` fall back to `1`.
 */
export function appearanceScaleVars(
  preference: AppearancePreference,
): Record<string, string> {
  const normalized = normalizeAppearance(preference);
  const vars: Record<string, string> = {};
  if (normalized.textSize !== "default") {
    vars["--sr-text-scale"] = TEXT_SIZE_SCALE[normalized.textSize];
  }
  if (normalized.roundness !== "default") {
    vars["--sr-radius-scale"] = ROUNDNESS_SCALE[normalized.roundness];
  }
  if (normalized.density !== "default") {
    vars["--sr-space-scale"] = DENSITY_SCALE[normalized.density];
  }
  if (normalized.font === "custom" && normalized.customFontFamily) {
    vars["--sr-ui-font"] = `'${normalized.customFontFamily}'`;
  }
  return vars;
}
