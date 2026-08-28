/**
 * The editorial light palette, flattened to hex.
 *
 * These mirror the light-mode values of `editorialUi` / `editorialPrimary` in
 * `./theme-editorial` (and match Standard Reader's email palette in
 * `apps/standard-reader/src/server/digest/emails/theme.ts`, so a Standard
 * Newsletter email and a Standard Digest email read as the same product).
 *
 * For anything rendered in the app, style with StyleX against the design
 * system's token modules (`theme/color.stylex` and friends) — those follow the
 * theme. Reach for this module only where CSS variables cannot:
 *
 * - **Email HTML** — mail clients strip `<style>` and do not resolve `var()`.
 * - **Standalone `Response` pages** — `lib/html-page.ts` ships its own `<style>`
 *   outside the app's StyleX bundle.
 * - **Database defaults** — per-publication theme columns store concrete colors.
 *
 * Keep in sync whenever the editorial theme's light values change.
 */
export const PALETTE = {
  /** `uiColor.bgSubtle` — warm paper (outer page background). */
  page: "#f2ece1",
  /** `primaryColor.bg` — near-white warm card surface. */
  card: "#fefdfc",
  /** `primaryColor.text2` — dark warm ink. */
  ink: "#3e332e",
  /** `uiColor.text1` — warm-gray secondary text. */
  inkSoft: "#726b64",
  /** Lighter warm gray — meta, counts, dates. */
  muted: "#9a928a",
  /** `uiColor.border1` — warm hairline / card border. */
  line: "#e4ddd1",
  /** `primaryColor.solid1` — solid terracotta accent. */
  accent: "#ad7f58",
  /** Accent text / links on paper. */
  accentInk: "#8a5f43",
  /** Text sitting on a solid accent fill. */
  accentForeground: "#ffffff",
} as const;

/** Font stacks matching `editorialFonts`, for the same non-CSS-variable contexts. */
export const PALETTE_FONTS = {
  serif: "'Newsreader', Georgia, 'Times New Roman', serif",
  sans: "'Atkinson Hyperlegible Next', system-ui, -apple-system, Helvetica, Arial, sans-serif",
  mono: "'Spline Sans Mono', 'SFMono-Regular', Menlo, monospace",
} as const;
