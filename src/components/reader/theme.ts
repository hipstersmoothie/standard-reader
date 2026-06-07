import * as stylex from "@stylexjs/stylex";

import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import { shadow } from "../../design-system/theme/shadow.stylex";
import { fontFamily } from "../../design-system/theme/typography.stylex";

/**
 * Editorial theme for Standard Reader — warm paper (light) and warm ink (dark),
 * ported from the prototype's Almanac palette (`APP_VISION.md` §8).
 */

/** Warm paper + ink neutrals (light) / warm night reading surfaces (dark). */
export const editorialUi = stylex.createTheme(uiColor, {
  overlayBackdrop:
    "light-dark(oklch(0.2 0.02 60 / 0.4), oklch(0.05 0.02 60 / 0.65))",
  bg: "light-dark(oklch(0.985 0.007 85), oklch(0.16 0.012 60))",
  bgSubtle: "light-dark(oklch(0.965 0.01 84), oklch(0.19 0.012 58))",
  component1: "light-dark(oklch(0.945 0.012 83), oklch(0.22 0.014 56))",
  component2: "light-dark(oklch(0.92 0.014 80), oklch(0.26 0.014 54))",
  component3: "light-dark(oklch(0.895 0.014 78), oklch(0.3 0.014 52))",
  border1: "light-dark(oklch(0.88 0.012 75), oklch(0.34 0.014 50))",
  border2: "light-dark(oklch(0.8 0.014 70), oklch(0.42 0.014 48))",
  border3: "light-dark(oklch(0.72 0.016 68), oklch(0.5 0.014 46))",
  solid1: "light-dark(oklch(0.245 0.012 60), oklch(0.9 0.01 85))",
  solid2: "light-dark(oklch(0.4 0.012 60), oklch(0.75 0.012 80))",
  text1: "light-dark(oklch(0.56 0.012 65), oklch(0.62 0.012 70))",
  text2: "light-dark(oklch(0.245 0.012 60), oklch(0.92 0.01 85))",
  textContrast: "light-dark(oklch(0.985 0.007 85), oklch(0.16 0.012 60))",
});

/** Terracotta accent — slightly brighter on dark for contrast. */
export const editorialPrimary = stylex.createTheme(primaryColor, {
  bg: "light-dark(oklch(0.95 0.03 55), oklch(0.22 0.04 42))",
  bgSubtle: "light-dark(oklch(0.965 0.022 58), oklch(0.24 0.045 40))",
  component1: "light-dark(oklch(0.93 0.045 50), oklch(0.28 0.06 38))",
  component2: "light-dark(oklch(0.9 0.055 48), oklch(0.32 0.07 36))",
  component3: "light-dark(oklch(0.87 0.065 46), oklch(0.36 0.08 34))",
  border1: "light-dark(oklch(0.8 0.09 44), oklch(0.45 0.1 34))",
  border2: "light-dark(oklch(0.7 0.12 42), oklch(0.55 0.12 34))",
  border3: "light-dark(oklch(0.62 0.14 40), oklch(0.62 0.14 34))",
  solid1: "light-dark(oklch(0.575 0.155 38), oklch(0.72 0.14 42))",
  solid2: "light-dark(oklch(0.46 0.16 36), oklch(0.78 0.12 44))",
  text1: "light-dark(oklch(0.52 0.15 37), oklch(0.8 0.12 44))",
  text2: "light-dark(oklch(0.46 0.16 36), oklch(0.84 0.1 46))",
  textContrast: "light-dark(white, oklch(0.16 0.012 60))",
});

/** Newsreader (serif/display), Archivo (sans/UI), Spline Sans Mono (mono). */
export const editorialFonts = stylex.createTheme(fontFamily, {
  title: "'Newsreader', Georgia, 'Times New Roman', serif",
  sans: "'Archivo', system-ui, -apple-system, sans-serif",
  serif: "'Newsreader', Georgia, 'Times New Roman', serif",
  mono: "'Spline Sans Mono', ui-monospace, 'SFMono-Regular', monospace",
});

/** Stronger shadows on dark surfaces so popovers/cards stay legible. */
export const editorialShadow = stylex.createTheme(shadow, {
  sm: "light-dark(0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1), 0 1px 3px 0 rgb(0 0 0 / 0.35), 0 1px 2px -1px rgb(0 0 0 / 0.35))",
  md: "light-dark(0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1), 0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.35))",
  lg: "light-dark(0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1), 0 10px 15px -3px rgb(0 0 0 / 0.45), 0 4px 6px -4px rgb(0 0 0 / 0.4))",
});
