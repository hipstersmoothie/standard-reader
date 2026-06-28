import type { PublicationEmbedMeta } from "#/integrations/tanstack-query/api-publication.functions";
import type { CSSProperties } from "react";

import { resolveQuoteOgColors } from "#/lib/publication-theme";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseHex(hex: string): Rgb | null {
  const m = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1];
  if (h.length === 3) {
    return {
      r: Number.parseInt(h[0] + h[0], 16),
      g: Number.parseInt(h[1] + h[1], 16),
      b: Number.parseInt(h[2] + h[2], 16),
    };
  }
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

function toHex(c: Rgb): string {
  const ch = (v: number) =>
    clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`;
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = clamp(amount, 0, 1);
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function relativeLuminance(c: Rgb): number {
  const x = c.r / 255;
  const rLin = x <= 0.039_28 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  const y = c.g / 255;
  const gLin = y <= 0.039_28 ? y / 12.92 : ((y + 0.055) / 1.055) ** 2.4;
  const z = c.b / 255;
  const bLin = z <= 0.039_28 ? z / 12.92 : ((z + 0.055) / 1.055) ** 2.4;
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const l = Math.max(relativeLuminance(a), relativeLuminance(b));
  const d = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (l + 0.05) / (d + 0.05);
}

function highContrastFallback(bg: Rgb): Rgb {
  return contrastRatio(BLACK, bg) >= contrastRatio(WHITE, bg) ? BLACK : WHITE;
}

function ensureContrast(fg: Rgb, bg: Rgb, minRatio: number): Rgb {
  return contrastRatio(fg, bg) >= minRatio ? fg : highContrastFallback(bg);
}

/** Darken a color toward black by `amount` (0–1). */
function darken(c: Rgb, amount: number): Rgb {
  return mix(c, BLACK, amount);
}

/** Lighten a color toward white by `amount` (0–1). */
function lighten(c: Rgb, amount: number): Rgb {
  return mix(c, WHITE, amount);
}

/**
 * A Radix-style 12-step scale collapsed into the semantic tokens the
 * design-system `uiColor` / `primaryColor` defineVars expect.
 *
 * Light mode: tints of the accent on a light surface.
 * Dark mode: dark accent-tinted surfaces with bright text.
 */
interface ColorScale {
  bg: string;
  bgSubtle: string;
  component1: string;
  component2: string;
  component3: string;
  border1: string;
  border2: string;
  border3: string;
  solid1: string;
  solid2: string;
  text1: string;
  text2: string;
  textContrast: string;
}

/**
 * Build the neutral (ui) scale from the publication's background + foreground.
 * Light: background tints; Dark: inverted dark surfaces with the same hue.
 */
function buildUiScale(
  background: Rgb,
  foreground: Rgb,
  isDark: boolean,
): ColorScale {
  if (isDark) {
    const darkBg = darken(background, 0.82);
    return {
      bg: toHex(darkBg),
      bgSubtle: toHex(lighten(darkBg, 0.03)),
      component1: toHex(lighten(darkBg, 0.06)),
      component2: toHex(lighten(darkBg, 0.1)),
      component3: toHex(lighten(darkBg, 0.16)),
      border1: toHex(lighten(darkBg, 0.18)),
      border2: toHex(lighten(darkBg, 0.26)),
      border3: toHex(lighten(darkBg, 0.36)),
      solid1: toHex(lighten(darkBg, 0.72)),
      solid2: toHex(lighten(darkBg, 0.6)),
      text1: toHex(ensureContrast(lighten(foreground, 0.3), darkBg, 3)),
      text2: toHex(ensureContrast(lighten(foreground, 0.75), darkBg, 4.5)),
      textContrast: toHex(darkBg),
    };
  }

  return {
    bg: toHex(background),
    bgSubtle: toHex(darken(background, 0.02)),
    component1: toHex(darken(background, 0.05)),
    component2: toHex(darken(background, 0.08)),
    component3: toHex(darken(background, 0.12)),
    border1: toHex(darken(background, 0.14)),
    border2: toHex(darken(background, 0.22)),
    border3: toHex(darken(background, 0.32)),
    solid1: toHex(darken(foreground, 0.75)),
    solid2: toHex(darken(foreground, 0.6)),
    text1: toHex(ensureContrast(darken(foreground, 0.2), background, 3)),
    text2: toHex(ensureContrast(foreground, background, 4.5)),
    textContrast: toHex(background),
  };
}

/**
 * Build the accent (primary) scale from the publication's accent color.
 * Light: accent tints on light bg; Dark: dark accent-tinted surfaces.
 */
function buildAccentScale(
  accent: Rgb,
  background: Rgb,
  isDark: boolean,
): ColorScale {
  if (isDark) {
    const darkAccentBg = darken(accent, 0.78);
    return {
      bg: toHex(darkAccentBg),
      bgSubtle: toHex(lighten(darkAccentBg, 0.04)),
      component1: toHex(lighten(darkAccentBg, 0.08)),
      component2: toHex(lighten(darkAccentBg, 0.14)),
      component3: toHex(lighten(darkAccentBg, 0.22)),
      border1: toHex(lighten(darkAccentBg, 0.24)),
      border2: toHex(lighten(darkAccentBg, 0.34)),
      border3: toHex(lighten(darkAccentBg, 0.46)),
      solid1: toHex(lighten(accent, 0.12)),
      solid2: toHex(lighten(accent, 0.24)),
      text1: toHex(ensureContrast(lighten(accent, 0.3), darkAccentBg, 3)),
      text2: toHex(ensureContrast(lighten(accent, 0.55), darkAccentBg, 4.5)),
      textContrast: toHex(darken(background, 0.82)),
    };
  }

  const lightBg = lighten(accent, 0.86);
  return {
    bg: toHex(lightBg),
    bgSubtle: toHex(lighten(accent, 0.82)),
    component1: toHex(lighten(accent, 0.74)),
    component2: toHex(lighten(accent, 0.64)),
    component3: toHex(lighten(accent, 0.52)),
    border1: toHex(lighten(accent, 0.4)),
    border2: toHex(lighten(accent, 0.28)),
    border3: toHex(lighten(accent, 0.16)),
    solid1: toHex(accent),
    solid2: toHex(darken(accent, 0.1)),
    text1: toHex(ensureContrast(darken(accent, 0.1), lightBg, 3)),
    text2: toHex(ensureContrast(darken(accent, 0.25), lightBg, 4.5)),
    textContrast: toHex(ensureContrast(WHITE, accent, 4.5)),
  };
}

type ScaleKey = keyof ColorScale;

const UI_KEYS: ReadonlyArray<ScaleKey> = [
  "bg",
  "bgSubtle",
  "component1",
  "component2",
  "component3",
  "border1",
  "border2",
  "border3",
  "solid1",
  "solid2",
  "text1",
  "text2",
  "textContrast",
];

const ACCENT_KEYS: ReadonlyArray<ScaleKey> = UI_KEYS;

/** Prefixes that map scale keys → `--pub-*` CSS variable names. */
const UI_PREFIX = "pub";
const ACCENT_PREFIX = "pub-accent";

function scaleKeyToVarName(
  prefix: string,
  key: ScaleKey,
  isDark: boolean,
): string {
  return `--${prefix}-${key}-${isDark ? "dark" : "light"}`;
}

/**
 * Generates the full set of `--pub-*` CSS custom properties (light + dark)
 * for both the neutral (ui) and accent (primary) scales, derived from the
 * publication's theme colors.
 *
 * Apply these on the same container that wears the `publicationUi` /
 * `publicationPrimary` StyleX theme classes — the theme classes reference
 * these vars via `light-dark(var(--pub-...-light), var(--pub-...-dark))`.
 */
export function publicationThemeScaleVars(
  meta: PublicationEmbedMeta,
): CSSProperties {
  const colors = resolveQuoteOgColors({
    themeBackground: meta.themeBackground,
    themeForeground: meta.themeForeground,
    themeAccent: meta.themeAccent,
    themeAccentForeground: meta.themeAccentForeground,
  });

  const fallbackBg = parseHex("#f9f7f2") ?? { r: 249, g: 247, b: 242 };
  const fallbackFg = parseHex("#3e3934") ?? { r: 62, g: 57, b: 52 };
  const fallbackAccent = parseHex("#bd5633") ?? { r: 189, g: 86, b: 51 };

  const background = parseHex(colors.background) ?? fallbackBg;
  const foreground = parseHex(colors.foreground) ?? fallbackFg;
  const accent = parseHex(colors.accent) ?? fallbackAccent;

  const uiLight = buildUiScale(background, foreground, false);
  const uiDark = buildUiScale(background, foreground, true);
  const accentLight = buildAccentScale(accent, background, false);
  const accentDark = buildAccentScale(accent, background, true);

  const vars: Record<string, string> = {};

  for (const key of UI_KEYS) {
    vars[scaleKeyToVarName(UI_PREFIX, key, false)] = uiLight[key];
    vars[scaleKeyToVarName(UI_PREFIX, key, true)] = uiDark[key];
  }
  for (const key of ACCENT_KEYS) {
    vars[scaleKeyToVarName(ACCENT_PREFIX, key, false)] = accentLight[key];
    vars[scaleKeyToVarName(ACCENT_PREFIX, key, true)] = accentDark[key];
  }

  // Overlay backdrop — derived from foreground hue.
  vars["--pub-overlay-light"] = toHex(darken(foreground, 0.6));
  vars["--pub-overlay-dark"] = toHex(darken(BLACK, 0.2));

  return vars as CSSProperties;
}
