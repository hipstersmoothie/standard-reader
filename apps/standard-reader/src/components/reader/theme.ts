import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { shadow } from "@standard-reader/design-system/theme/shadow.stylex";
import { fontFamily } from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

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
  bg: {
    default: "light-dark(#fefdfc, #12110f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.995 0.992 0.989), color(display-p3 0.071 0.067 0.059))",
  },
  bgSubtle: {
    default: "light-dark(#fcf9f6, #1c1816)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.987 0.976 0.964), color(display-p3 0.107 0.095 0.087))",
  },
  component1: {
    default: "light-dark(#f6eee7, #28211d)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.959 0.936 0.909), color(display-p3 0.151 0.13 0.115))",
  },
  component2: {
    default: "light-dark(#f0e4d9, #322922)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.934 0.897 0.855), color(display-p3 0.191 0.161 0.138))",
  },
  component3: {
    default: "light-dark(#ebdaca, #3e3128)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.909 0.856 0.798), color(display-p3 0.235 0.194 0.162))",
  },
  border1: {
    default: "light-dark(#e4cdb7, #4d3c2f)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.88 0.808 0.73), color(display-p3 0.291 0.237 0.192))",
  },
  border2: {
    default: "light-dark(#dcbc9f, #614a39)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.841 0.742 0.639), color(display-p3 0.365 0.295 0.232))",
  },
  border3: {
    default: "light-dark(#cea37e, #7c5f46)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.782 0.647 0.514), color(display-p3 0.469 0.377 0.287))",
  },
  solid1: {
    default: "light-dark(#ad7f58, #ad7f58)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.651 0.505 0.368), color(display-p3 0.651 0.505 0.368))",
  },
  solid2: {
    default: "light-dark(#a07553, #b88c67)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.601 0.465 0.344), color(display-p3 0.697 0.557 0.423))",
  },
  text1: {
    default: "light-dark(#815e46, #dbb594)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.485 0.374 0.288), color(display-p3 0.835 0.715 0.597))",
  },
  text2: {
    default: "light-dark(#3e332e, #f2e1ca)",
    "@media (color-gamut: p3)":
      "light-dark(color(display-p3 0.236 0.202 0.183), color(display-p3 0.938 0.885 0.802))",
  },
});

/** Newsreader (serif/display), Atkinson Hyperlegible Next (sans/UI), Spline Sans Mono (mono). */
export const editorialFonts = stylex.createTheme(fontFamily, {
  // The `* Fallback: *` families are metric-adjusted @font-face rules generated
  // by Capsize in src/styles.css (`pnpm fonts:generate`); they keep the local
  // fallback the same size as the web font so text doesn't shift as it loads.
  title:
    "'Newsreader', 'Newsreader Fallback: Georgia', 'Newsreader Fallback: Times New Roman', Georgia, 'Times New Roman', serif",
  sans: "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible Next Fallback: -apple-system', 'Atkinson Hyperlegible Next Fallback: Arial', system-ui, -apple-system, sans-serif",
  serif:
    "'Newsreader', 'Newsreader Fallback: Georgia', 'Newsreader Fallback: Times New Roman', Georgia, 'Times New Roman', serif",
  mono: "'Spline Sans Mono', 'Spline Sans Mono Fallback', ui-monospace, 'SFMono-Regular', monospace",
});

/** Stronger shadows on dark surfaces so popovers/cards stay legible. */
export const editorialShadow = stylex.createTheme(shadow, {
  sm: "light-dark(0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1), 0 1px 3px 0 rgb(0 0 0 / 0.35), 0 1px 2px -1px rgb(0 0 0 / 0.35))",
  md: "light-dark(0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1), 0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.35))",
  lg: "light-dark(0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1), 0 10px 15px -3px rgb(0 0 0 / 0.45), 0 4px 6px -4px rgb(0 0 0 / 0.4))",
});
