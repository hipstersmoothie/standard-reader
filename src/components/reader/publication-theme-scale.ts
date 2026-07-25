import Color from "colorjs.io";
import type { CSSProperties } from "react";

import type { PublicationFonts } from "#/lib/publication-fonts";
import { resolveQuoteOgColors } from "#/lib/publication-theme";
import type {
  ResolvedPublicationTheme,
  ThemePalette,
} from "#/lib/publication-theme-source";
import { resolvePublicationTheme } from "#/lib/publication-theme-source";

/**
 * The four flat theme colors every themed surface starts from — the publication
 * record's `basicTheme`, flattened onto the `publications` row. Structurally a
 * subset of `PublicationEmbedMeta`, so that type can be passed directly.
 */
export interface PublicationThemeColors {
  themeBackground: string | null;
  themeForeground: string | null;
  themeAccent: string | null;
  themeAccentForeground: string | null;
  /**
   * The publisher's own dark palette, when their native theme carries one (see
   * `#/lib/publication-theme-source`). Absent means "derive dark from the light
   * colors", which is all `basicTheme` alone can support.
   */
  dark?: ThemePalette | null;
  /** Stated light-mode neutral steps; absent slots stay derived. */
  surface?: string | null;
  surfaceHover?: string | null;
  border?: string | null;
  /** Stated link colour for light mode; dark comes from the dark palette. */
  link?: string | null;
  /** Stated neutral solid fill (Offprint `neutral`). */
  neutral?: string | null;
  /** Canvas the page card sits on, when distinct from the page surface. */
  canvas?: string | null;
  /**
   * Fixed canvas background image, already resolved to a URL server-side (the
   * blob CID alone can't be turned into one without the publication's DID).
   */
  backgroundImage?: {
    url: string;
    repeat: boolean;
    width: number | null;
  } | null;
  /**
   * Google Fonts families the publisher chose, already resolved from their
   * platform's key format (see `#/lib/publication-fonts`). Unresolved fonts stay
   * `null` so the reader keeps their own typography.
   */
  fonts?: PublicationFonts | null;
}

/** Pull the neutral anchors out of a palette, or null when it states none. */
function anchorsOf(palette: {
  surface?: string | null;
  surfaceHover?: string | null;
  border?: string | null;
}): NeutralAnchors | null {
  if (!palette.surface && !palette.surfaceHover && !palette.border) return null;
  return {
    surface: palette.surface ?? null,
    surfaceHover: palette.surfaceHover ?? null,
    border: palette.border ?? null,
  };
}

/**
 * The page surface and body text a reader actually sees in each mode — the
 * *generated* values, which differ from the stated theme colours whenever a mode
 * had to be synthesized. Anything matching against the rendered page (the code
 * theme picker) must score on these, not on the stated background.
 */
export function publicationRenderedSurfaces(meta: PublicationThemeColors): {
  light: { background: string; foreground: string };
  dark: { background: string; foreground: string };
} {
  const vars = publicationThemeScaleVars(meta) as Record<string, string>;
  return {
    light: {
      background: vars["--pub-bg-light"],
      foreground: vars["--pub-text2-light"],
    },
    dark: {
      background: vars["--pub-bg-dark"],
      foreground: vars["--pub-text2-dark"],
    },
  };
}

/**
 * Adapt a resolved publisher theme (`resolvePublicationTheme`) into the shape
 * the scale generator and the flat `theme_*` columns share.
 */
export function themeColorsFromResolved(
  theme: ResolvedPublicationTheme,
): PublicationThemeColors {
  return {
    themeBackground: theme.light.background,
    themeForeground: theme.light.foreground,
    themeAccent: theme.light.accent,
    themeAccentForeground: theme.light.accentForeground,
    dark: theme.dark,
    surface: theme.light.surface,
    surfaceHover: theme.light.surfaceHover,
    border: theme.light.border,
    link: theme.light.link,
    neutral: theme.light.neutral,
    canvas: theme.light.canvas,
  };
}

/**
 * Build the theme for a `publications` row. The flat `theme_*` columns hold the
 * flattened `basicTheme` baseline; `theme_json` additionally carries the
 * publisher's native theme under `nativeTheme`, which wins per-slot when it
 * expresses something the baseline can't (Leaflet's real page surface, an
 * authored dark palette).
 */
export function publicationThemeFromRow(row: {
  themeBackground: string | null;
  themeForeground: string | null;
  themeAccent: string | null;
  themeAccentForeground: string | null;
  themeJson: unknown;
}): PublicationThemeColors {
  const json =
    row.themeJson && typeof row.themeJson === "object"
      ? (row.themeJson as Record<string, unknown>)
      : null;
  const resolved = resolvePublicationTheme(json, json?.nativeTheme);
  return {
    themeBackground: resolved.light.background ?? row.themeBackground,
    themeForeground: resolved.light.foreground ?? row.themeForeground,
    themeAccent: resolved.light.accent ?? row.themeAccent,
    themeAccentForeground:
      resolved.light.accentForeground ?? row.themeAccentForeground,
    dark: resolved.dark,
    surface: resolved.light.surface,
    surfaceHover: resolved.light.surfaceHover,
    border: resolved.light.border,
    link: resolved.light.link,
    neutral: resolved.light.neutral,
    canvas: resolved.light.canvas,
  };
}

/**
 * Whether a publication actually carries theme colors of its own.
 *
 * `publicationThemeScaleVars` always produces a full palette — it falls back to
 * the site's editorial-ish defaults when colors are missing. That fallback is
 * right for surfaces that are inherently the publication's (OG cards, subscribe
 * embeds), but on in-app pages it would swap the real design-system tokens for a
 * hand-rolled approximation of them for no visual gain. Gate on this first and
 * leave unthemed publications on the editorial theme.
 */
export function hasPublicationThemeColors(
  colors: PublicationThemeColors | null | undefined,
): colors is PublicationThemeColors {
  if (!colors) return false;
  return Boolean(
    colors.themeBackground?.trim() ||
    colors.themeForeground?.trim() ||
    colors.themeAccent?.trim() ||
    colors.themeAccentForeground?.trim(),
  );
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function parseHex(hex: string): Rgb | null {
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

export function toHex(c: Rgb): string {
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

/**
 * Whether a surface reads as dark — i.e. white text contrasts better than black
 * against it. Drives which mode a publisher's stated background belongs to, and
 * therefore which way the neutral ramp has to travel to stay visible.
 */
function isDarkColor(color: Rgb): boolean {
  return contrastRatio(WHITE, color) > contrastRatio(BLACK, color);
}

/**
 * Neutral stand-in used only when a colour can't be inverted (unparseable, or
 * an achromatic value whose hue carries no information to preserve).
 */
const DEFAULT_LIGHT_BG: Rgb = { r: 253, g: 253, b: 252 };
const DEFAULT_DARK_BG: Rgb = { r: 17, g: 17, b: 17 };

/** Target lightness for a synthesized page background, in OKLCH terms. */
const SYNTH_LIGHT_L = 0.975;
const SYNTH_DARK_L = 0.17;
/**
 * How much of the source chroma a synthesized background keeps. The same chroma
 * reads far more saturated at high lightness than at low, so a dark plum
 * inverted at full chroma becomes a lurid pink rather than the pale, warm paper
 * the publisher's palette implies.
 */
const SYNTH_LIGHT_CHROMA = 0.28;
const SYNTH_DARK_CHROMA = 0.5;
/** Ink for a synthesized mode: near the opposite end, keeping the hue. */
const SYNTH_LIGHT_INK_L = 0.25;
const SYNTH_DARK_INK_L = 0.92;

/**
 * A theme states one background. Rather than dropping the publisher's character
 * on the mode they didn't author, mirror the colour through OKLCH: keep its hue,
 * move lightness to the other end, and damp chroma so the result reads as paper
 * or ink rather than a saturated wash. A warm near-black page becomes a warm
 * cream one; a deep green becomes pale mint.
 *
 * Returns `null` when the colour can't be parsed, so callers fall back to a
 * neutral default.
 */
function invertLightness(
  color: Rgb,
  target: "light" | "dark",
  kind: "background" | "ink" = "background",
): Rgb | null {
  const toLight = target === "light";
  try {
    const oklch = new Color(toHex(color)).to("oklch");
    const [, chroma, hue] = oklch.coords;
    const lightness =
      kind === "ink"
        ? toLight
          ? SYNTH_LIGHT_INK_L
          : SYNTH_DARK_INK_L
        : toLight
          ? SYNTH_LIGHT_L
          : SYNTH_DARK_L;
    const damped =
      (chroma ?? 0) * (toLight ? SYNTH_LIGHT_CHROMA : SYNTH_DARK_CHROMA);
    const next = new Color("oklch", [lightness, damped, hue ?? 0]).to("srgb");
    // `toGamut` keeps the hue while pulling chroma back into sRGB.
    next.toGamut({ space: "srgb", method: "clip" });
    return {
      r: (next.coords[0] ?? 0) * 255,
      g: (next.coords[1] ?? 0) * 255,
      b: (next.coords[2] ?? 0) * 255,
    };
  } catch {
    return null;
  }
}

function ensureContrast(fg: Rgb, bg: Rgb, minRatio: number): Rgb {
  return contrastRatio(fg, bg) >= minRatio ? fg : highContrastFallback(bg);
}

/**
 * Bring a colour up to a contrast ratio by moving its OKLCH lightness away from
 * the background, keeping hue and chroma.
 *
 * Unlike {@link ensureContrast}, which flips to black or white, this preserves
 * the colour's identity — essential for a publisher's stated link colour, where
 * snapping to black would discard the very distinction we adopted it for. Plenty
 * of real link colours (a teal `#0d9488` on white is ~3.9:1) sit just under AA
 * and only need a nudge.
 */
function ensureReadable(color: Rgb, bg: Rgb, minRatio: number): Rgb {
  if (contrastRatio(color, bg) >= minRatio) return color;
  try {
    const oklch = new Color(toHex(color)).to("oklch");
    const [lightness, chroma, hue] = oklch.coords;
    const towardsDark = !isDarkColor(bg);
    let current = lightness ?? 0.5;
    for (let step = 0; step < 50; step += 1) {
      current += towardsDark ? -0.02 : 0.02;
      if (current <= 0 || current >= 1) break;
      const next = new Color("oklch", [current, chroma ?? 0, hue ?? 0]).to(
        "srgb",
      );
      next.toGamut({ space: "srgb", method: "clip" });
      const candidate = {
        r: (next.coords[0] ?? 0) * 255,
        g: (next.coords[1] ?? 0) * 255,
        b: (next.coords[2] ?? 0) * 255,
      };
      if (contrastRatio(candidate, bg) >= minRatio) return candidate;
    }
  } catch {
    // Fall through to the hard fallback below.
  }
  return highContrastFallback(bg);
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
export interface ColorScale {
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
 * A stated neutral solid (Offprint `neutral`) replaces the neutral fill we
 * otherwise derive from the foreground. `solid2` is the lighter companion step.
 */
function applyNeutralSolid(
  scale: ColorScale,
  stated: string | null | undefined,
  towards: Rgb,
): ColorScale {
  const parsed = stated ? parseHex(stated) : null;
  if (!parsed) return scale;
  return {
    ...scale,
    solid1: toHex(parsed),
    solid2: toHex(mix(parsed, towards, 0.18)),
  };
}

/**
 * Where each neutral step sits on a 0→1 ramp from the page background (0) to the
 * strongest border (1). Publisher-supplied colors are pinned at the step whose
 * semantics they match, and the steps between anchors are interpolated — so a
 * stated `base200` lands on `component1` exactly, rather than near it.
 */
const NEUTRAL_ELEVATION: Readonly<Record<string, number>> = {
  bgSubtle: 0.1,
  component1: 0.22,
  component2: 0.34,
  component3: 0.48,
  border1: 0.58,
  border2: 0.75,
  border3: 1,
};

export interface NeutralAnchors {
  /** Resting secondary surface — cards, sidebars (`component1`). */
  surface: string | null;
  /** Hover state of that surface (`component2`). */
  surfaceHover: string | null;
  /** Borders and dividers (`border1`). */
  border: string | null;
}

const ANCHOR_ELEVATION = {
  surface: NEUTRAL_ELEVATION.component1,
  surfaceHover: NEUTRAL_ELEVATION.component2,
  border: NEUTRAL_ELEVATION.border1,
} as const;

/**
 * Re-lay the neutral steps along a piecewise-linear ramp through whatever the
 * publisher actually stated, keeping the derived scale everywhere they said
 * nothing. Returns the scale unchanged when there are no anchors, so
 * publications that only carry a `basicTheme` render exactly as before.
 */
function applyNeutralAnchors(
  derived: ColorScale,
  background: Rgb,
  anchors: NeutralAnchors | null,
): ColorScale {
  if (!anchors) return derived;

  const points: Array<{ elevation: number; color: Rgb }> = [];
  for (const key of ["surface", "surfaceHover", "border"] as const) {
    const parsed = anchors[key] ? parseHex(anchors[key]) : null;
    if (parsed)
      points.push({ elevation: ANCHOR_ELEVATION[key], color: parsed });
  }
  if (points.length === 0) return derived;

  const ramp = [
    { elevation: 0, color: background },
    ...points.toSorted((a, b) => a.elevation - b.elevation),
    // The far end stays wherever the derived scale put it, so an anchored ramp
    // still terminates at a border strong enough to read as one.
    { elevation: 1, color: parseHex(derived.border3) ?? background },
  ];

  const next: ColorScale = { ...derived };
  for (const [key, elevation] of Object.entries(NEUTRAL_ELEVATION)) {
    let lo = ramp[0];
    let hi = ramp.at(-1) as { elevation: number; color: Rgb };
    for (let i = 0; i < ramp.length - 1; i += 1) {
      if (
        elevation >= ramp[i].elevation &&
        elevation <= ramp[i + 1].elevation
      ) {
        lo = ramp[i];
        hi = ramp[i + 1];
        break;
      }
    }
    const span = hi.elevation - lo.elevation;
    const t = span === 0 ? 0 : (elevation - lo.elevation) / span;
    next[key as keyof ColorScale] = toHex(mix(lo.color, hi.color, t));
  }
  return next;
}

/**
 * Build the neutral (ui) scale from an already-dark background + foreground.
 * Split out from {@link buildUiScale} so a publisher-authored dark palette can
 * be used verbatim instead of one derived by darkening their light background.
 */
function buildDarkUiScale(darkBg: Rgb, foreground: Rgb): ColorScale {
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

/**
 * Build the neutral (ui) scale for a light page background, tinting *downward*
 * from it. Only valid when `background` really is light — a dark background
 * darkened further collapses every step into the same near-black, which is what
 * {@link isDarkColor} routing exists to prevent.
 */
function buildLightUiScale(background: Rgb, foreground: Rgb): ColorScale {
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
 * Accent scale against an already-dark page background. Split out for the same
 * reason as {@link buildDarkUiScale} — so a publisher's own dark palette drives
 * it rather than one derived from their light colors.
 */
export function buildDarkAccentScale(accent: Rgb, darkPageBg: Rgb): ColorScale {
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
    textContrast: toHex(darkPageBg),
  };
}

/**
 * Build the accent (primary) scale from the publication's accent color.
 * Light: accent tints on light bg; Dark: dark accent-tinted surfaces.
 */
export function buildLightAccentScale(accent: Rgb): ColorScale {
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
  meta: PublicationThemeColors,
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

  // A theme states one background. Route it to the mode its own luminance
  // matches: a dark publication (Leaflet on black, a dark-scheme Offprint theme)
  // supplies the *dark* page and light mode falls back to a neutral light one —
  // rather than painting a dark page for a reader in light mode and deriving a
  // ramp with nowhere to travel.
  const statedBgIsDark = isDarkColor(background);
  const lightBg = statedBgIsDark
    ? (invertLightness(background, "light") ?? DEFAULT_LIGHT_BG)
    : background;
  // Ink for the synthesized mode is mirrored from their own text colour, so a
  // warm palette keeps warm ink rather than falling back to flat black.
  const lightFg = statedBgIsDark
    ? (invertLightness(foreground, "light", "ink") ?? foreground)
    : foreground;

  // Stated neutral steps describe the surface they were authored against, so
  // they may only anchor the ramp that actually uses that background.
  const uiLight = applyNeutralSolid(
    applyNeutralAnchors(
      buildLightUiScale(lightBg, lightFg),
      lightBg,
      statedBgIsDark ? null : anchorsOf(meta),
    ),
    statedBgIsDark ? null : meta.neutral,
    lightBg,
  );
  const accentLight = buildLightAccentScale(accent);

  // Prefer the publisher's own dark palette (PCKT ships light+dark, Offprint
  // may ship a dark-scheme theme); otherwise use their stated background when it
  // is already dark, and only darken their light one as a last resort.
  const authoredDark = meta.dark ?? null;
  const authoredDarkBg = authoredDark?.background
    ? parseHex(authoredDark.background)
    : null;
  const darkFg = authoredDark?.foreground
    ? parseHex(authoredDark.foreground)
    : null;
  const darkAccent = authoredDark?.accent
    ? parseHex(authoredDark.accent)
    : null;

  const darkBg =
    authoredDarkBg ??
    (statedBgIsDark
      ? background
      : (invertLightness(background, "dark") ?? DEFAULT_DARK_BG));
  const derivedDarkFg =
    darkFg ??
    (statedBgIsDark
      ? foreground
      : (invertLightness(foreground, "dark", "ink") ?? foreground));
  // The stated palette *is* the dark one when its background is dark, so its
  // anchors belong here.
  const darkAnchors = authoredDarkBg
    ? anchorsOf(authoredDark ?? {})
    : statedBgIsDark
      ? anchorsOf(meta)
      : null;

  const uiDark = applyNeutralSolid(
    applyNeutralAnchors(
      buildDarkUiScale(darkBg, derivedDarkFg),
      darkBg,
      darkAnchors,
    ),
    authoredDark ? authoredDark.neutral : statedBgIsDark ? meta.neutral : null,
    WHITE,
  );
  const accentDark = buildDarkAccentScale(darkAccent ?? accent, darkBg);

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

  // Stated link colour, per mode. Left unset when the publisher states none, so
  // `publicationLink` falls back to the accent's text step. Contrast is enforced
  // against the page the link sits on — a publisher's link colour chosen for
  // their own surface can be unreadable on a synthesized one.
  const linkFor = (
    stated: string | null | undefined,
    pageBg: Rgb,
  ): string | null => {
    const parsed = stated ? parseHex(stated) : null;
    return parsed ? toHex(ensureReadable(parsed, pageBg, 4.5)) : null;
  };
  const lightLink = linkFor(statedBgIsDark ? null : meta.link, lightBg);
  const darkLink = linkFor(
    authoredDark ? authoredDark.link : meta.link,
    darkBg,
  );
  if (lightLink) vars["--pub-link-light"] = lightLink;
  if (darkLink) vars["--pub-link-dark"] = darkLink;

  return vars as CSSProperties;
}
