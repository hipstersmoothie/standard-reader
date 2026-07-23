/**
 * The collections publication's theme as the renderer consumes it: the flattened
 * `basicTheme` colors (CSS color strings) plus Google Font names from
 * `app.standard-reader.publicationTheme` (merged into `themeJson` on ingest).
 * Shared across all of a user's collections. Client-safe.
 */
export interface CollectionTheme {
  background: string | null;
  foreground: string | null;
  accent: string | null;
  accentForeground: string | null;
  fontTitle: string | null;
  fontBody: string | null;
}

function cleanFont(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Pull the `{ title, body }` font names out of a publication's `themeJson`. */
export function themeFontsFromJson(themeJson: unknown): {
  title: string | null;
  body: string | null;
} {
  if (themeJson && typeof themeJson === "object") {
    const fonts = (themeJson as Record<string, unknown>).fonts;
    if (fonts && typeof fonts === "object") {
      const f = fonts as Record<string, unknown>;
      return { title: cleanFont(f.title), body: cleanFont(f.body) };
    }
  }
  return { title: null, body: null };
}

/** Whether a theme carries any color or font worth applying. */
export function hasTheme(theme: CollectionTheme | null): boolean {
  return Boolean(
    theme &&
    (theme.background ||
      theme.foreground ||
      theme.accent ||
      theme.accentForeground ||
      theme.fontTitle ||
      theme.fontBody),
  );
}
