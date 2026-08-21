/**
 * Theme preference shared types/helpers.
 *
 * Persisted as `light | dark | system | custom` in the `standard-reader-theme`
 * cookie (SSR for everyone). Signed-in users also store `light | dark | custom`
 * on `user.theme_mode` (`null` = system).
 *
 * `custom` hands the scheme over to the reader's palette (`#/lib/appearance`):
 * the palette states light or dark, so unlike `system` it does not track the OS.
 * Everything downstream still deals in a `ResolvedThemeScheme`.
 */

export type ThemeMode = "light" | "dark" | "system" | "custom";

/**
 * A theme mode with `custom` already resolved to the scheme its palette renders
 * in — what the server passes around when it only needs to know which scheme to
 * render for (see `themeModeForRequest`).
 */
export type ThemeSchemeMode = "light" | "dark" | "system";

export type ResolvedThemeScheme = "light" | "dark";

export const THEME_MODES = ["light", "dark", "system", "custom"] as const;

export const DEFAULT_THEME_MODE: ThemeMode = "system";

export const THEME_COOKIE = "standard-reader-theme";

export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isThemeMode(value: unknown): value is ThemeMode {
  return (
    value === "light" ||
    value === "dark" ||
    value === "system" ||
    value === "custom"
  );
}

export function parseThemeMode(value: unknown): ThemeMode {
  return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
}

export function themeModeToDbValue(
  mode: ThemeMode,
): "light" | "dark" | "custom" | null {
  return mode === "system" ? null : mode;
}

export function dbValueToThemeMode(
  value: string | null | undefined,
): ThemeMode {
  return value === "light" || value === "dark" || value === "custom"
    ? value
    : "system";
}

/**
 * Resolve `system` using the optional client hint header when present, and
 * `custom` using the palette's own scheme (the caller resolves the palette —
 * this module deliberately knows nothing about `#/lib/appearance`).
 */
export function resolveThemeScheme(
  mode: ThemeMode,
  prefersColorSchemeHeader?: string | null,
  paletteScheme?: ResolvedThemeScheme | null,
): ResolvedThemeScheme {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  if (mode === "custom") return paletteScheme ?? "light";
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
/**
 * Browser/PWA title-bar color per resolved scheme — editorial primary
 * `component1` (see `src/components/reader/theme.ts`). Single source of truth
 * for the `<meta name="theme-color">` content, set both by the pre-paint script
 * below and reactively when the user changes theme.
 */
export const THEME_COLOR_BY_SCHEME: Record<ResolvedThemeScheme, string> = {
  light: "#f6eee7",
  dark: "#28211d",
};

/**
 * PWA splash / task-switcher background per resolved scheme — the app's page
 * surface (`uiColor.bg` in `src/components/reader/theme.ts`), not the slightly
 * raised title-bar tone above. Feeds the manifest's `background_color`.
 */
export const PWA_BACKGROUND_COLOR_BY_SCHEME: Record<
  ResolvedThemeScheme,
  string
> = {
  light: "#fcfbf6",
  dark: "#110c08",
};

/**
 * Client-written cookie carrying the colors the app is *actually* painted in,
 * as `<theme-color>|<background-color>` (both `#rrggbb`).
 *
 * A web app manifest is a static document fetched out-of-band, so it cannot see
 * `data-theme` — yet Firefox on Android colors an installed PWA's status bar and
 * navigation bar from the manifest's `theme_color`, ignoring the live
 * `<meta name="theme-color">` this app keeps in sync. A hardcoded light
 * `theme_color` is why a dark-mode reader got pale bands above and below the
 * page. `/manifest.json` is served per-request from this cookie instead.
 *
 * The client is the writer because it is the only side that always knows the
 * answer: `system` mode needs `prefers-color-scheme` (no client hint is
 * negotiated, and Firefox does not send them at all), and a custom palette's
 * paper is only fully resolved once the shell has its preference. Both are
 * already computed pre-paint for the meta tag — see `RESOLVED_SCHEME_SCRIPT`.
 */
export const PWA_THEME_COOKIE = "standard-reader-pwa-theme";

export const PWA_THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** `#rrggbb` only — the cookie is attacker-controlled input on the way back. */
const HEX_COLOR = /^#[\da-f]{6}$/i;

export interface PwaThemeColors {
  themeColor: string;
  backgroundColor: string;
}

export const DEFAULT_PWA_THEME_COLORS: PwaThemeColors = {
  themeColor: THEME_COLOR_BY_SCHEME.light,
  backgroundColor: PWA_BACKGROUND_COLOR_BY_SCHEME.light,
};

export function formatPwaThemeCookie(colors: PwaThemeColors): string {
  return `${colors.themeColor}|${colors.backgroundColor}`;
}

/** Parse the cookie back, falling back to the light pair on anything unexpected. */
export function parsePwaThemeCookie(value: unknown): PwaThemeColors {
  if (typeof value !== "string") return DEFAULT_PWA_THEME_COLORS;
  // `Set-Cookie` percent-encodes `#`, so what arrives is `%23f6eee7|%23fcfbf6`.
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return DEFAULT_PWA_THEME_COLORS;
  }
  const [themeColor = "", backgroundColor = ""] = decoded.split("|");
  if (!HEX_COLOR.test(themeColor) || !HEX_COLOR.test(backgroundColor)) {
    return DEFAULT_PWA_THEME_COLORS;
  }
  return { themeColor, backgroundColor };
}

export const RESOLVED_SCHEME_SCRIPT = `
(function () {
  var root = document.documentElement;
  var mode = root.getAttribute("data-theme");
  var resolved =
    mode === "dark" ? "dark" :
    mode === "light" ? "light" :
    mode === "custom" ? (root.getAttribute("data-palette-scheme") === "dark" ? "dark" : "light") :
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  root.setAttribute("data-resolved-scheme", resolved);
  // Point the title-bar color at the *resolved* scheme so an explicit in-app
  // light/dark override wins over the OS preference (a plain media-query meta
  // can't see \`data-theme\`). A custom palette carries its own page color,
  // rendered onto \`data-theme-color\` server-side.
  var palette = mode === "custom" ? root.getAttribute("data-theme-color") : null;
  var themeColor = palette || (resolved === "dark" ? "${THEME_COLOR_BY_SCHEME.dark}" : "${THEME_COLOR_BY_SCHEME.light}");
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", themeColor);
  // Hand the same colors to \`/manifest.json\`, which browsers fetch without any
  // page context — a custom palette's paper doubles as the splash background.
  var background = palette || (resolved === "dark" ? "${PWA_BACKGROUND_COLOR_BY_SCHEME.dark}" : "${PWA_BACKGROUND_COLOR_BY_SCHEME.light}");
  var value = encodeURIComponent(themeColor + "|" + background);
  if (document.cookie.indexOf("${PWA_THEME_COOKIE}=" + value) === -1) {
    document.cookie = "${PWA_THEME_COOKIE}=" + value + ";path=/;max-age=${PWA_THEME_COOKIE_MAX_AGE_SECONDS};samesite=lax";
  }
})();
`.trim();

/**
 * Keep `PWA_THEME_COOKIE` current after hydration — the pre-paint script only
 * runs on a full document load, so an in-app theme switch or an OS flip while
 * the app is open would otherwise leave the manifest on the previous colors.
 */
export function writePwaThemeCookie(colors: PwaThemeColors): void {
  if (globalThis.document === undefined) return;
  const value = encodeURIComponent(formatPwaThemeCookie(colors));
  // `document.cookie`, not the `cookieStore` API the rule prefers: Firefox does
  // not ship `cookieStore`, and Firefox is the browser this cookie exists for.
  // eslint-disable-next-line unicorn/no-document-cookie
  if (document.cookie.includes(`${PWA_THEME_COOKIE}=${value}`)) return;
  // eslint-disable-next-line unicorn/no-document-cookie
  document.cookie = `${PWA_THEME_COOKIE}=${value};path=/;max-age=${PWA_THEME_COOKIE_MAX_AGE_SECONDS};samesite=lax`;
}

export function readDomResolvedScheme(): ResolvedThemeScheme | null {
  if (globalThis.document === undefined) return null;
  const value = globalThis.document.documentElement.dataset.resolvedScheme;
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

/** Client-side subscription for `html[data-resolved-scheme]` + OS theme changes. */
export function subscribeToResolvedScheme(
  onStoreChange: () => void,
): () => void {
  if (globalThis.document === undefined) return () => {};

  const root = globalThis.document.documentElement;
  const media = globalThis.matchMedia("(prefers-color-scheme: dark)");
  const observer = new MutationObserver(onStoreChange);
  observer.observe(root, {
    attributes: true,
    attributeFilter: [
      "data-resolved-scheme",
      "data-theme",
      "data-palette-scheme",
    ],
  });

  const onMediaChange = (event: MediaQueryListEvent) => {
    if (root.dataset.theme === "system") {
      root.dataset.resolvedScheme = event.matches ? "dark" : "light";
    }
    onStoreChange();
  };
  media.addEventListener("change", onMediaChange);

  return () => {
    observer.disconnect();
    media.removeEventListener("change", onMediaChange);
  };
}

export function resolveSchemeForMode(
  mode: ThemeMode,
  paletteScheme?: ResolvedThemeScheme | null,
): ResolvedThemeScheme {
  if (mode === "dark" || mode === "light") return mode;
  if (mode === "custom") return paletteScheme ?? "light";
  return readDomResolvedScheme() ?? getSystemColorScheme();
}

/** SSR default when `mode` is `system` (no DOM / client hints in this path). */
export function resolvedSchemeServerSnapshot(
  mode: ThemeMode,
  paletteScheme?: ResolvedThemeScheme | null,
): ResolvedThemeScheme {
  if (mode === "dark" || mode === "light") return mode;
  if (mode === "custom") return paletteScheme ?? "light";
  return "light";
}
