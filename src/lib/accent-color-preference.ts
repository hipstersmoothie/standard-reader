/**
 * App-wide accent color preference — lets a signed-in reader repaint the
 * app's accent token from a curated preset (`#/lib/accent-color-presets`) or
 * any custom color, instead of the default editorial "camel" accent.
 *
 * Stores either a preset id or a literal `#rrggbb` hex on
 * `user.accent_color`. `null` = unset, the default (renders exactly as the
 * hand-tuned `editorialPrimary` theme always has — see
 * `#/components/reader/theme` and `#/lib/accent-color-scale`).
 *
 * Signed-in only (the setting lives on the settings page, which guests can't
 * reach), so this is stored on `user.accent_color` with no cookie mirror —
 * same as `#/lib/publication-theme-preference`.
 */
import { accentColorPresetById } from "./accent-color-presets";
import { isValidCustomAccentColor } from "./accent-color-scale";

export const DEFAULT_ACCENT_COLOR: string | null = null;

/** A valid preference value is a known preset id or a `#rrggbb` hex; anything
 * else (a stale/garbage DB value) is treated as unset. */
export function isValidAccentColorValue(value: string): boolean {
  return (
    accentColorPresetById(value) !== null || isValidCustomAccentColor(value)
  );
}

export function accentColorToDbValue(value: string | null): string | null {
  if (!value) return null;
  return isValidAccentColorValue(value) ? value : null;
}

export function dbValueToAccentColor(
  value: string | null | undefined,
): string | null {
  if (!value) return DEFAULT_ACCENT_COLOR;
  return isValidAccentColorValue(value) ? value : DEFAULT_ACCENT_COLOR;
}
