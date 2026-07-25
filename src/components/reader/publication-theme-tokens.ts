import * as stylex from "@stylexjs/stylex";

import {
  linkColor,
  primaryColor,
  uiColor,
} from "../../design-system/theme/color.stylex";
import { fontFamily } from "../../design-system/theme/typography.stylex";

/**
 * Publication-themed overrides for the design-system color tokens.
 *
 * The values reference `--pub-*` CSS custom properties set at runtime via an
 * inline `style` on the page container (see `publicationThemeScaleVars`).
 * `light-dark()` adapts to the user's color-scheme — the container sets both
 * light and dark `--pub-*` values.
 *
 * Mirrors `editorialUi` / `editorialPrimary` in `theme.ts`, but routes every
 * token through runtime CSS variables instead of hard-coded OKLCH values.
 *
 * Variable names are kebab-case to match `publication-theme-scale.ts`:
 * `--pub-{key}-{light|dark}` and `--pub-accent-{key}-{light|dark}`.
 */

export const publicationUi = stylex.createTheme(uiColor, {
  overlayBackdrop:
    "light-dark(var(--pub-overlay-light), var(--pub-overlay-dark))",
  bg: "light-dark(var(--pub-bg-light), var(--pub-bg-dark))",
  bgSubtle: "light-dark(var(--pub-bgSubtle-light), var(--pub-bgSubtle-dark))",
  component1:
    "light-dark(var(--pub-component1-light), var(--pub-component1-dark))",
  component2:
    "light-dark(var(--pub-component2-light), var(--pub-component2-dark))",
  component3:
    "light-dark(var(--pub-component3-light), var(--pub-component3-dark))",
  border1: "light-dark(var(--pub-border1-light), var(--pub-border1-dark))",
  border2: "light-dark(var(--pub-border2-light), var(--pub-border2-dark))",
  border3: "light-dark(var(--pub-border3-light), var(--pub-border3-dark))",
  solid1: "light-dark(var(--pub-solid1-light), var(--pub-solid1-dark))",
  solid2: "light-dark(var(--pub-solid2-light), var(--pub-solid2-dark))",
  text1: "light-dark(var(--pub-text1-light), var(--pub-text1-dark))",
  text2: "light-dark(var(--pub-text2-light), var(--pub-text2-dark))",
  textContrast:
    "light-dark(var(--pub-textContrast-light), var(--pub-textContrast-dark))",
});

export const publicationPrimary = stylex.createTheme(primaryColor, {
  bg: "light-dark(var(--pub-accent-bg-light), var(--pub-accent-bg-dark))",
  bgSubtle:
    "light-dark(var(--pub-accent-bgSubtle-light), var(--pub-accent-bgSubtle-dark))",
  component1:
    "light-dark(var(--pub-accent-component1-light), var(--pub-accent-component1-dark))",
  component2:
    "light-dark(var(--pub-accent-component2-light), var(--pub-accent-component2-dark))",
  component3:
    "light-dark(var(--pub-accent-component3-light), var(--pub-accent-component3-dark))",
  border1:
    "light-dark(var(--pub-accent-border1-light), var(--pub-accent-border1-dark))",
  border2:
    "light-dark(var(--pub-accent-border2-light), var(--pub-accent-border2-dark))",
  border3:
    "light-dark(var(--pub-accent-border3-light), var(--pub-accent-border3-dark))",
  solid1:
    "light-dark(var(--pub-accent-solid1-light), var(--pub-accent-solid1-dark))",
  solid2:
    "light-dark(var(--pub-accent-solid2-light), var(--pub-accent-solid2-dark))",
  text1:
    "light-dark(var(--pub-accent-text1-light), var(--pub-accent-text1-dark))",
  text2:
    "light-dark(var(--pub-accent-text2-light), var(--pub-accent-text2-dark))",
  textContrast:
    "light-dark(var(--pub-accent-textContrast-light), var(--pub-accent-textContrast-dark))",
});

/**
 * Publisher-chosen typefaces, layered over the editorial stack rather than
 * replacing it: `--pub-font-title` / `--pub-font-body` are set at runtime only
 * when a font actually resolved, and each falls back to the editorial family
 * (and its Capsize metric-adjusted fallbacks) when it didn't. So a publication
 * that states no fonts — or one whose font Google doesn't serve — renders in
 * exactly the app's own typography.
 */
const EDITORIAL_TITLE =
  "'Newsreader', 'Newsreader Fallback: Georgia', 'Newsreader Fallback: Times New Roman', Georgia, 'Times New Roman', serif";
const EDITORIAL_SANS =
  "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible Next Fallback: -apple-system', 'Atkinson Hyperlegible Next Fallback: Arial', system-ui, -apple-system, sans-serif";

export const publicationFonts = stylex.createTheme(fontFamily, {
  title: `var(--pub-font-title, ${EDITORIAL_TITLE})`,
  serif: `var(--pub-font-body, ${EDITORIAL_TITLE})`,
  sans: `var(--pub-font-body, ${EDITORIAL_SANS})`,
  mono: "'Spline Sans Mono', 'Spline Sans Mono Fallback', ui-monospace, 'SFMono-Regular', monospace",
});

/**
 * Publisher-stated link colour. Falls back to the accent's text step, which is
 * exactly what links used before this token existed — so a publication that
 * states no link colour renders identically.
 */
export const publicationLink = stylex.createTheme(linkColor, {
  text: "light-dark(var(--pub-link-light, var(--pub-accent-text2-light)), var(--pub-link-dark, var(--pub-accent-text2-dark)))",
  hover:
    "light-dark(var(--pub-link-hover-light, var(--pub-accent-text1-light)), var(--pub-link-hover-dark, var(--pub-accent-text1-dark)))",
});

/**
 * The page card: a route's own content, floated on the canvas image a
 * publication's theme may supply.
 *
 * Applied by each page around the part that is *content* — the article's sticky
 * reading chrome and the site footer are app furniture and stay outside it.
 * Every value falls back to a no-op, so a page wearing this style is visually
 * unchanged unless `PublicationThemeScope` is painting a canvas behind it (only
 * then does it publish `--pub-page-*`).
 *
 * Deliberately no `overflow` — clipping here would break the sticky reading
 * chrome, and the content already has its own padding.
 */
export const publicationPageCard = stylex.create({
  card: {
    backgroundColor: "var(--pub-page-surface, transparent)",
    // Squircle corners, matching the app's other rounded surfaces.
    cornerShape: "squircle",
    borderRadius: "var(--pub-page-radius, 0)",
    // Border width is variable too, so the card adds no box in the default
    // no-canvas case — a transparent 1px border would still eat inner width.
    borderColor: "var(--pub-page-border, transparent)",
    borderStyle: "solid",
    borderWidth: "var(--pub-page-border-width, 0)",
    boxSizing: "border-box",
    marginBlockEnd: "var(--pub-page-inset, 0)",
    marginBlockStart: "var(--pub-page-inset, 0)",
    // Centred at the reading measure, which the caller supplies — the content
    // inside already sat at exactly this width, so without a canvas behind it
    // this changes nothing.
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    // Callers with their own measure (the article) override this by applying
    // their width style after the card's.
    maxWidth: "var(--pub-page-max-width, none)",
    width: "100%",
  },
});
