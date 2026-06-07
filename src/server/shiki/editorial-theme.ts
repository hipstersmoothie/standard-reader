import type { ResolvedThemeScheme } from "#/lib/theme";
import type { ThemeRegistration } from "shiki";

import rosePineDawn from "shiki/themes/rose-pine-dawn.mjs";
import rosePineMoon from "shiki/themes/rose-pine-moon.mjs";

/**
 * Shiki themes aligned with `editorialUi` / `editorialPrimary` in
 * `src/components/reader/theme.ts`. Rose Pine variants are remapped to our
 * warm paper (light) and warm ink (dark) palettes.
 */
const EDITORIAL_LIGHT_COLOR_MAP: Record<string, string> = {
  "#faf4ed": "#f5f2ed",
  "#fffaf3": "#faf9f6",
  "#f2e9e1": "#ede8e1",
  "#575279": "#3a3632",
  "#797593": "#6b6560",
  "#9893a5": "#8a837c",
  "#286983": "#9a4422",
  "#d7827e": "#c2562a",
  "#907aa9": "#6b5344",
  "#56949f": "#7a5c42",
  "#b4637a": "#a84830",
  "#ea9d34": "#b8863a",
};

const EDITORIAL_DARK_COLOR_MAP: Record<string, string> = {
  "#191724": "#242018",
  "#232136": "#2a2620",
  "#1f1d2e": "#2e2a24",
  "#2a273f": "#332e28",
  "#393552": "#3d3832",
  "#e0def4": "#f0ebe4",
  "#908caa": "#9a948c",
  "#6e6a86": "#7a746c",
  "#817c9c": "#6f6962",
  "#3e8fb0": "#e8885a",
  "#ea9a97": "#f09068",
  "#eb6f92": "#e07a52",
  "#c4a7e7": "#c9a88e",
  "#f6c177": "#d4a064",
  "#9ccfd8": "#b8886a",
};

export const EDITORIAL_CODE_THEME_NAME = "standard-reader";
export const EDITORIAL_CODE_THEME_DARK_NAME = "standard-reader-dark";

function remapThemeColor(
  value: string,
  colorMap: Record<string, string>,
): string {
  const lower = value.toLowerCase();
  for (const [from, to] of Object.entries(colorMap).toSorted(
    (a, b) => b[0].length - a[0].length,
  )) {
    if (lower.startsWith(from)) {
      return `${to}${lower.slice(from.length)}`;
    }
  }
  return value;
}

function remapThemeValue(
  value: unknown,
  colorMap: Record<string, string>,
): unknown {
  if (typeof value === "string" && value.startsWith("#")) {
    return remapThemeColor(value, colorMap);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => remapThemeValue(entry, colorMap));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        remapThemeValue(entry, colorMap),
      ]),
    );
  }
  return value;
}

export const editorialCodeTheme = remapThemeValue(
  { ...rosePineDawn, name: EDITORIAL_CODE_THEME_NAME },
  EDITORIAL_LIGHT_COLOR_MAP,
) as ThemeRegistration;

export const editorialCodeThemeDark = remapThemeValue(
  { ...rosePineMoon, name: EDITORIAL_CODE_THEME_DARK_NAME },
  EDITORIAL_DARK_COLOR_MAP,
) as ThemeRegistration;

export function codeThemeNameForScheme(scheme: ResolvedThemeScheme): string {
  return scheme === "dark"
    ? EDITORIAL_CODE_THEME_DARK_NAME
    : EDITORIAL_CODE_THEME_NAME;
}
