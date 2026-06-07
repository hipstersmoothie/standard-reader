/**
 * Theme preference shared types/helpers.
 *
 * Persisted as `light | dark | system` in the `standard-reader-theme` cookie
 * (SSR for everyone). Signed-in users also store `light | dark` on
 * `user.theme_mode` (`null` = system).
 */

export type ThemeMode = "light" | "dark" | "system";

export type ResolvedThemeScheme = "light" | "dark";

export const THEME_MODES = ["light", "dark", "system"] as const;

export const DEFAULT_THEME_MODE: ThemeMode = "system";

export const THEME_COOKIE = "standard-reader-theme";

export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function parseThemeMode(value: unknown): ThemeMode {
  return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
}

export function themeModeToDbValue(mode: ThemeMode): "light" | "dark" | null {
  return mode === "system" ? null : mode;
}

export function dbValueToThemeMode(
  value: string | null | undefined,
): ThemeMode {
  return value === "light" || value === "dark" ? value : "system";
}

/** Resolve `system` using the optional client hint header when present. */
export function resolveThemeScheme(
  mode: ThemeMode,
  prefersColorSchemeHeader?: string | null,
): ResolvedThemeScheme {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return prefersColorSchemeHeader === "dark" ? "dark" : "light";
}

export type CodeHighlightsByScheme = Record<
  ResolvedThemeScheme,
  Record<string, string>
>;

export const EMPTY_CODE_HIGHLIGHTS: CodeHighlightsByScheme = {
  light: {},
  dark: {},
};

/** Synchronous `system` resolution — runs in `<head>` before React hydrates. */
export const RESOLVED_SCHEME_SCRIPT = `
(function () {
  var mode = document.documentElement.getAttribute("data-theme");
  var resolved =
    mode === "dark" ? "dark" :
    mode === "light" ? "light" :
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-resolved-scheme", resolved);
})();
`.trim();

export function readDomResolvedScheme(): ResolvedThemeScheme | null {
  if (globalThis.document === undefined) return null;
  const value =
    globalThis.document.documentElement.getAttribute("data-resolved-scheme");
  return value === "dark" || value === "light" ? value : null;
}

export function readInitialSystemColorScheme(): ResolvedThemeScheme {
  return readDomResolvedScheme() ?? getSystemColorScheme();
}

export function getSystemColorScheme(): ResolvedThemeScheme {
  if (typeof globalThis.matchMedia !== "function") {
    return "light";
  }
  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function pickCodeHighlight(
  highlights: CodeHighlightsByScheme,
  scheme: ResolvedThemeScheme,
  key: string,
): string | undefined {
  return highlights[scheme][key] ?? highlights.light[key];
}
