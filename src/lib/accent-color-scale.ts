/**
 * App-wide accent color preference — lets a signed-in reader repaint the
 * app's single accent token (`primaryColor`) from a curated preset
 * (`#/lib/accent-color-presets`) or any custom color, reusing the same
 * light+dark scale derivation built for per-publication theming
 * (`buildLightAccentScale` / `buildDarkAccentScale` in
 * `#/components/reader/publication-theme-scale`) rather than hand-tuning a
 * token set per option.
 *
 * A stored preference value is either a preset id or a literal `#rrggbb` hex.
 * `null` means "no preference" — the caller keeps the hand-tuned
 * `editorialPrimary` theme untouched (`#/components/reader/theme`), so a
 * reader who never opens this setting sees zero visual change.
 */
import type { CSSProperties } from "react";

import type {
  ColorScale,
  Rgb,
} from "#/components/reader/publication-theme-scale";
import {
  buildDarkAccentScale,
  buildLightAccentScale,
  parseHex,
} from "#/components/reader/publication-theme-scale";

import { accentColorPresetById } from "./accent-color-presets";

/** Hex equivalent of the editorial dark page background (`editorialUi.bg`
 * dark value in `theme.ts`, `oklch(0.16 0.012 60)`) — the accent scale only
 * uses this as the "text sitting directly on the page" fallback color. */
const DARK_PAGE_BG: Rgb = { r: 17, g: 12, b: 8 }; // #110c08

const SCALE_KEYS: ReadonlyArray<keyof ColorScale> = [
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

const CUSTOM_HEX_PATTERN = /^#[\da-f]{6}$/i;

export function isValidCustomAccentColor(value: string): boolean {
  return CUSTOM_HEX_PATTERN.test(value.trim());
}

/**
 * Resolve a stored preference value (preset id or `#rrggbb`) to a seed hex,
 * or `null` when it's neither a known preset nor a valid hex — callers treat
 * that the same as "no preference".
 */
export function resolveAccentSeedHex(value: string | null): string | null {
  if (!value) return null;
  const preset = accentColorPresetById(value);
  if (preset) return preset.seed;
  return isValidCustomAccentColor(value) ? value.trim().toLowerCase() : null;
}

/**
 * `--app-accent-{key}-{light|dark}` CSS custom properties for the
 * `appAccentPrimary` theme (`#/components/reader/theme`) to apply, via inline
 * `style`, on the element that wears that theme class.
 */
export function accentColorScaleVars(seedHex: string): CSSProperties | null {
  const seed = parseHex(seedHex);
  if (!seed) return null;

  const light = buildLightAccentScale(seed);
  const dark = buildDarkAccentScale(seed, DARK_PAGE_BG);

  const vars: Record<string, string> = {};
  for (const key of SCALE_KEYS) {
    vars[`--app-accent-${key}-light`] = light[key];
    vars[`--app-accent-${key}-dark`] = dark[key];
  }
  return vars as CSSProperties;
}
