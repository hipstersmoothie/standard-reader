/**
 * Light / dark / system, for a set of styles that are already `light-dark()`
 * pairs (see `theme-editorial.ts`). That means the whole preference is one CSS
 * property — `color-scheme` on `<html>` — and nothing has to re-render for the
 * app to change appearance: `system` hands the choice back to the OS by naming
 * both schemes.
 *
 * The choice is kept in `localStorage`, and {@link THEME_PREPAINT_SCRIPT}
 * replays it in `<head>` before the first paint, so a dark-mode user never sees
 * a white flash on load. The server can't know the preference, so SSR always
 * emits the `system` markup and that script corrects it synchronously.
 */

export type ThemeMode = "light" | "dark" | "system";

export const THEME_MODES: ReadonlyArray<ThemeMode> = [
  "light",
  "dark",
  "system",
];

export const DEFAULT_THEME_MODE: ThemeMode = "system";

export const THEME_STORAGE_KEY = "standard-newsletter-theme";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

/** The stored choice, or `system` when there is none (or no storage at all). */
export function readStoredThemeMode(): ThemeMode {
  if (globalThis.localStorage === undefined) return DEFAULT_THEME_MODE;
  try {
    const stored = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : DEFAULT_THEME_MODE;
  } catch {
    // Storage can throw outright (Safari private mode, blocked cookies).
    return DEFAULT_THEME_MODE;
  }
}

/**
 * The `color-scheme` value for a mode. Naming both schemes is what "system"
 * means to the browser — it resolves `light-dark()` from the OS preference and
 * keeps following it as that changes, with no listener on our side.
 */
export function colorSchemeFor(mode: ThemeMode): string {
  return mode === "system" ? "light dark" : mode;
}

export function applyThemeMode(mode: ThemeMode): void {
  if (globalThis.document === undefined) return;
  globalThis.document.documentElement.style.colorScheme = colorSchemeFor(mode);
}

export function storeThemeMode(mode: ThemeMode): void {
  if (globalThis.localStorage === undefined) return;
  try {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // A preference we can't persist is still worth applying for this session.
  }
}

/**
 * Runs in `<head>`, before the body paints. Inlined rather than imported so it
 * is not waiting on a module graph — the whole point is that it beats the first
 * pixel.
 */
export const THEME_PREPAINT_SCRIPT = `
(function () {
  try {
    var mode = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    document.documentElement.style.colorScheme =
      mode === "dark" ? "dark" : mode === "light" ? "light" : "light dark";
  } catch (e) {}
})();
`.trim();
