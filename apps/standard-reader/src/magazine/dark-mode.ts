import { themePrefersDark } from "#/lib/collections/radix-theme";
import type { CollectionTheme } from "#/lib/collections/theme";

/** Theme default, overridden when the reader explicitly toggled paper mode. */
export function readMagazineDark(
  theme: CollectionTheme | null | undefined,
): boolean {
  if (globalThis.window === undefined) {
    return themePrefersDark(theme);
  }
  try {
    const stored = localStorage.getItem("mag-dark");
    if (stored !== null) return stored === "1";
  } catch {
    // private browsing / disabled storage
  }
  return themePrefersDark(theme);
}
