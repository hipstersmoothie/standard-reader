import * as stylex from "@stylexjs/stylex";

import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";

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
