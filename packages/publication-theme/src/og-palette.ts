/**
 * The site's editorial light palette, flattened to hex.
 *
 * These mirror the light-mode values of `editorialUi` / `editorialPrimary` in
 * `src/components/reader/theme.ts`. OG cards render through satori + resvg,
 * which can't resolve `oklch()` or `light-dark()`, so we keep a hand-synced hex
 * copy here. Update these whenever the editorial theme's light values change.
 */
export const SITE_OG_PALETTE = {
  /** `uiColor.bg` — warm paper. */
  background: "#fcfaf5",
  /** `uiColor.text2` — ink. */
  foreground: "#251f1b",
  /** `uiColor.text1` — muted secondary text. */
  muted: "#7a736d",
  /** `primaryColor.text1` — the warm terracotta accent (kickers, rules). */
  accent: "#815e46",
  /** Paper, for text sitting on an accent fill. */
  accentForeground: "#fcfaf5",
  /** `uiColor.border1` — hairline rules. */
  line: "#dcd6cf",
} as const;
