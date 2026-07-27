export type ExtensionThemeMode = "light" | "dark";

const STORAGE_KEY = "theme";

/** True when running in an extension page (popup, options), not a content script. */
export function isExtensionPageContext(): boolean {
  const protocol = globalThis.location?.protocol ?? "";
  return (
    protocol === "chrome-extension:" ||
    protocol === "moz-extension:" ||
    protocol === "ms-browser-extension:"
  );
}

export function getExtensionThemeMode(): ExtensionThemeMode {
  if (globalThis.localStorage === undefined) return "light";
  const stored = globalThis.localStorage.getItem(STORAGE_KEY);
  if (stored === "dark") return "dark";
  if (stored === "light") return "light";
  return globalThis.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyExtensionColorScheme(mode: ExtensionThemeMode): void {
  if (!isExtensionPageContext()) return;
  document.documentElement.style.colorScheme = mode;
}

export function setExtensionThemeMode(mode: ExtensionThemeMode): void {
  applyExtensionColorScheme(mode);
  globalThis.localStorage?.setItem(STORAGE_KEY, mode);
}
