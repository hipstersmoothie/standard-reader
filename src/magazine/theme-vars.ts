import type { CollectionTheme } from "#/lib/collections/theme";
import type { CSSProperties } from "react";

/**
 * Inline font overrides for a themed magazine. Colors are handled separately by
 * the generated Radix palette ({@link import("#/lib/collections/radix-theme")});
 * here we only map the theme's Google fonts to `--serif` (body) and
 * `--mag-title-font` (display).
 */
export function magazineThemeStyle(
  theme: CollectionTheme | null | undefined,
): CSSProperties {
  if (!theme) return {};
  const style: Record<string, string> = {};
  if (theme.fontBody) {
    style["--serif"] = `"${theme.fontBody}", Georgia, "Times New Roman", serif`;
  }
  if (theme.fontTitle) {
    style["--mag-title-font"] = `"${theme.fontTitle}"`;
  }
  return style as CSSProperties;
}

/** Google Fonts stylesheet URL for the theme's title/body fonts, or null. */
export function googleFontsHref(
  theme: CollectionTheme | null | undefined,
): string | null {
  if (!theme) return null;
  const families = [theme.fontTitle, theme.fontBody].filter(
    (f): f is string => Boolean(f),
  );
  if (families.length === 0) return null;
  // Request families WITHOUT a `wght` axis: Google Fonts CSS2 errors the whole
  // request if any family lacks a requested weight (e.g. single-weight display
  // fonts like "Black Ops One"), which silently breaks all font loading — and
  // therefore the magazine's page-length measurement. Bold weights fall back to
  // synthetic bold, which is fine.
  const params = [...new Set(families)]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
