import * as stylex from "@stylexjs/stylex";

import {
  primaryColor,
  uiColor,
  uiInverted,
} from "../../design-system/theme/color.stylex";
import { amber } from "../../design-system/theme/colors/amber.stylex";
import { grass } from "../../design-system/theme/colors/grass.stylex";
import { indigo } from "../../design-system/theme/colors/indigo.stylex";
import {
  mauve,
  mauveInverted,
} from "../../design-system/theme/colors/mauve.stylex";
import { plum } from "../../design-system/theme/colors/plum.stylex";
import {
  sage,
  sageInverted,
} from "../../design-system/theme/colors/sage.stylex";
import {
  sand,
  sandInverted,
} from "../../design-system/theme/colors/sand.stylex";
import {
  slate,
  slateInverted,
} from "../../design-system/theme/colors/slate.stylex";
import { teal } from "../../design-system/theme/colors/teal.stylex";
import { tomato } from "../../design-system/theme/colors/tomato.stylex";
import { mediaQueries } from "../../design-system/theme/media-queries.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import { size } from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import { fontFamily } from "../../design-system/theme/typography.stylex";
import type { AppearanceFont, PaletteId } from "../../lib/appearance";
import { editorialPrimary, editorialUi } from "./theme";

/**
 * Themes behind the `custom` theme mode and the appearance dials
 * (`#/lib/appearance`).
 *
 * Two tracks, deliberately:
 *
 * - **Curated palettes** are static `createTheme`s over the vendored Radix
 *   scales. They cost nothing at runtime and are exactly the palette Radix
 *   ships — no approximation. Each states one scheme; the shell forces
 *   `color-scheme` to it, which is what picks the right half of every
 *   `light-dark()` in the scale.
 * - **The reader's own colors** go through `appearance-vars.ts`, which
 *   generates a full contrast-checked ramp into `--sr-*` custom properties that
 *   `customUi` / `customPrimary` below read.
 *
 * The numeric dials are multipliers rather than swapped literals: one `calc()`
 * per token, so the same setting moves the chrome *and* the article body (whose
 * sizes are authored as raw rem, not tokens) in step. Each falls back to `1`, so
 * a reader on the defaults renders identically to before this existed.
 */

const OVERLAY_BACKDROP = "light-dark(rgba(4, 1, 1, 0.5), rgba(0, 0, 0, 0.75))";

const EDITORIAL_TITLE =
  "'Newsreader', 'Newsreader Fallback: Georgia', 'Newsreader Fallback: Times New Roman', Georgia, 'Times New Roman', serif";
const EDITORIAL_SANS =
  "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible Next Fallback: -apple-system', 'Atkinson Hyperlegible Next Fallback: Arial', system-ui, -apple-system, sans-serif";
const EDITORIAL_MONO =
  "'Spline Sans Mono', 'Spline Sans Mono Fallback', ui-monospace, 'SFMono-Regular', monospace";

/* -------------------------------------------------------------------------- */
/* Neutral (ui) palettes                                                      */
/* -------------------------------------------------------------------------- */

export const sageUi = stylex.createTheme(uiColor, {
  overlayBackdrop: OVERLAY_BACKDROP,
  bg: sage.bg,
  bgSubtle: sage.bgSubtle,
  component1: sage.component1,
  component2: sage.component2,
  component3: sage.component3,
  border1: sage.border1,
  border2: sage.border2,
  border3: sage.border3,
  solid1: sage.solid1,
  solid2: sage.solid2,
  text1: sage.text1,
  text2: sage.text2,
  textContrast: "white",
});

export const sageUiInverted = stylex.createTheme(uiInverted, {
  bg: sageInverted.bg,
  bgSubtle: sageInverted.bgSubtle,
  component1: sageInverted.component1,
  component2: sageInverted.component2,
  component3: sageInverted.component3,
  border1: sageInverted.border1,
  border2: sageInverted.border2,
  border3: sageInverted.border3,
  solid1: sageInverted.solid1,
  solid2: sageInverted.solid2,
  text1: sageInverted.text1,
  text2: sageInverted.text2,
  textContrast: "white",
});

export const sandUi = stylex.createTheme(uiColor, {
  overlayBackdrop: OVERLAY_BACKDROP,
  bg: sand.bg,
  bgSubtle: sand.bgSubtle,
  component1: sand.component1,
  component2: sand.component2,
  component3: sand.component3,
  border1: sand.border1,
  border2: sand.border2,
  border3: sand.border3,
  solid1: sand.solid1,
  solid2: sand.solid2,
  text1: sand.text1,
  text2: sand.text2,
  textContrast: "white",
});

export const sandUiInverted = stylex.createTheme(uiInverted, {
  bg: sandInverted.bg,
  bgSubtle: sandInverted.bgSubtle,
  component1: sandInverted.component1,
  component2: sandInverted.component2,
  component3: sandInverted.component3,
  border1: sandInverted.border1,
  border2: sandInverted.border2,
  border3: sandInverted.border3,
  solid1: sandInverted.solid1,
  solid2: sandInverted.solid2,
  text1: sandInverted.text1,
  text2: sandInverted.text2,
  textContrast: "white",
});

export const slateUi = stylex.createTheme(uiColor, {
  overlayBackdrop: OVERLAY_BACKDROP,
  bg: slate.bg,
  bgSubtle: slate.bgSubtle,
  component1: slate.component1,
  component2: slate.component2,
  component3: slate.component3,
  border1: slate.border1,
  border2: slate.border2,
  border3: slate.border3,
  solid1: slate.solid1,
  solid2: slate.solid2,
  text1: slate.text1,
  text2: slate.text2,
  textContrast: "white",
});

export const slateUiInverted = stylex.createTheme(uiInverted, {
  bg: slateInverted.bg,
  bgSubtle: slateInverted.bgSubtle,
  component1: slateInverted.component1,
  component2: slateInverted.component2,
  component3: slateInverted.component3,
  border1: slateInverted.border1,
  border2: slateInverted.border2,
  border3: slateInverted.border3,
  solid1: slateInverted.solid1,
  solid2: slateInverted.solid2,
  text1: slateInverted.text1,
  text2: slateInverted.text2,
  textContrast: "white",
});

export const mauveUi = stylex.createTheme(uiColor, {
  overlayBackdrop: OVERLAY_BACKDROP,
  bg: mauve.bg,
  bgSubtle: mauve.bgSubtle,
  component1: mauve.component1,
  component2: mauve.component2,
  component3: mauve.component3,
  border1: mauve.border1,
  border2: mauve.border2,
  border3: mauve.border3,
  solid1: mauve.solid1,
  solid2: mauve.solid2,
  text1: mauve.text1,
  text2: mauve.text2,
  textContrast: "white",
});

export const mauveUiInverted = stylex.createTheme(uiInverted, {
  bg: mauveInverted.bg,
  bgSubtle: mauveInverted.bgSubtle,
  component1: mauveInverted.component1,
  component2: mauveInverted.component2,
  component3: mauveInverted.component3,
  border1: mauveInverted.border1,
  border2: mauveInverted.border2,
  border3: mauveInverted.border3,
  solid1: mauveInverted.solid1,
  solid2: mauveInverted.solid2,
  text1: mauveInverted.text1,
  text2: mauveInverted.text2,
  textContrast: "white",
});

/* -------------------------------------------------------------------------- */
/* Accent palettes                                                            */
/* -------------------------------------------------------------------------- */

export const grassPrimary = stylex.createTheme(primaryColor, {
  bg: grass.bg,
  bgSubtle: grass.bgSubtle,
  component1: grass.component1,
  component2: grass.component2,
  component3: grass.component3,
  border1: grass.border1,
  border2: grass.border2,
  border3: grass.border3,
  solid1: grass.solid1,
  solid2: grass.solid2,
  text1: grass.text1,
  text2: grass.text2,
  textContrast: "white",
});

export const tomatoPrimary = stylex.createTheme(primaryColor, {
  bg: tomato.bg,
  bgSubtle: tomato.bgSubtle,
  component1: tomato.component1,
  component2: tomato.component2,
  component3: tomato.component3,
  border1: tomato.border1,
  border2: tomato.border2,
  border3: tomato.border3,
  solid1: tomato.solid1,
  solid2: tomato.solid2,
  text1: tomato.text1,
  text2: tomato.text2,
  textContrast: "white",
});

export const indigoPrimary = stylex.createTheme(primaryColor, {
  bg: indigo.bg,
  bgSubtle: indigo.bgSubtle,
  component1: indigo.component1,
  component2: indigo.component2,
  component3: indigo.component3,
  border1: indigo.border1,
  border2: indigo.border2,
  border3: indigo.border3,
  solid1: indigo.solid1,
  solid2: indigo.solid2,
  text1: indigo.text1,
  text2: indigo.text2,
  textContrast: "white",
});

export const plumPrimary = stylex.createTheme(primaryColor, {
  bg: plum.bg,
  bgSubtle: plum.bgSubtle,
  component1: plum.component1,
  component2: plum.component2,
  component3: plum.component3,
  border1: plum.border1,
  border2: plum.border2,
  border3: plum.border3,
  solid1: plum.solid1,
  solid2: plum.solid2,
  text1: plum.text1,
  text2: plum.text2,
  textContrast: "white",
});

export const tealPrimary = stylex.createTheme(primaryColor, {
  bg: teal.bg,
  bgSubtle: teal.bgSubtle,
  component1: teal.component1,
  component2: teal.component2,
  component3: teal.component3,
  border1: teal.border1,
  border2: teal.border2,
  border3: teal.border3,
  solid1: teal.solid1,
  solid2: teal.solid2,
  text1: teal.text1,
  text2: teal.text2,
  textContrast: "white",
});

/** Amber's solid steps are bright enough that white on them fails AA. */
export const amberPrimary = stylex.createTheme(primaryColor, {
  bg: amber.bg,
  bgSubtle: amber.bgSubtle,
  component1: amber.component1,
  component2: amber.component2,
  component3: amber.component3,
  border1: amber.border1,
  border2: amber.border2,
  border3: amber.border3,
  solid1: amber.solid1,
  solid2: amber.solid2,
  text1: amber.text1,
  text2: amber.text2,
  textContrast: "black",
});

/* -------------------------------------------------------------------------- */
/* The reader's own colors                                                    */
/* -------------------------------------------------------------------------- */

export const customUi = stylex.createTheme(uiColor, {
  overlayBackdrop:
    "light-dark(var(--sr-overlay-light), var(--sr-overlay-dark))",
  bg: "light-dark(var(--sr-bg-light), var(--sr-bg-dark))",
  bgSubtle: "light-dark(var(--sr-bgSubtle-light), var(--sr-bgSubtle-dark))",
  component1:
    "light-dark(var(--sr-component1-light), var(--sr-component1-dark))",
  component2:
    "light-dark(var(--sr-component2-light), var(--sr-component2-dark))",
  component3:
    "light-dark(var(--sr-component3-light), var(--sr-component3-dark))",
  border1: "light-dark(var(--sr-border1-light), var(--sr-border1-dark))",
  border2: "light-dark(var(--sr-border2-light), var(--sr-border2-dark))",
  border3: "light-dark(var(--sr-border3-light), var(--sr-border3-dark))",
  solid1: "light-dark(var(--sr-solid1-light), var(--sr-solid1-dark))",
  solid2: "light-dark(var(--sr-solid2-light), var(--sr-solid2-dark))",
  text1: "light-dark(var(--sr-text1-light), var(--sr-text1-dark))",
  text2: "light-dark(var(--sr-text2-light), var(--sr-text2-dark))",
  textContrast:
    "light-dark(var(--sr-textContrast-light), var(--sr-textContrast-dark))",
});

export const customPrimary = stylex.createTheme(primaryColor, {
  bg: "light-dark(var(--sr-accent-bg-light), var(--sr-accent-bg-dark))",
  bgSubtle:
    "light-dark(var(--sr-accent-bgSubtle-light), var(--sr-accent-bgSubtle-dark))",
  component1:
    "light-dark(var(--sr-accent-component1-light), var(--sr-accent-component1-dark))",
  component2:
    "light-dark(var(--sr-accent-component2-light), var(--sr-accent-component2-dark))",
  component3:
    "light-dark(var(--sr-accent-component3-light), var(--sr-accent-component3-dark))",
  border1:
    "light-dark(var(--sr-accent-border1-light), var(--sr-accent-border1-dark))",
  border2:
    "light-dark(var(--sr-accent-border2-light), var(--sr-accent-border2-dark))",
  border3:
    "light-dark(var(--sr-accent-border3-light), var(--sr-accent-border3-dark))",
  solid1:
    "light-dark(var(--sr-accent-solid1-light), var(--sr-accent-solid1-dark))",
  solid2:
    "light-dark(var(--sr-accent-solid2-light), var(--sr-accent-solid2-dark))",
  text1:
    "light-dark(var(--sr-accent-text1-light), var(--sr-accent-text1-dark))",
  text2:
    "light-dark(var(--sr-accent-text2-light), var(--sr-accent-text2-dark))",
  textContrast:
    "light-dark(var(--sr-accent-textContrast-light), var(--sr-accent-textContrast-dark))",
});

/* -------------------------------------------------------------------------- */
/* Interface typeface                                                         */
/* -------------------------------------------------------------------------- */

/** One family throughout: Atkinson carries headings as well as UI. */
export const sansInterfaceFonts = stylex.createTheme(fontFamily, {
  title: EDITORIAL_SANS,
  sans: EDITORIAL_SANS,
  serif: EDITORIAL_SANS,
  mono: EDITORIAL_MONO,
});

/**
 * A Google family the reader chose, layered over the editorial stack: if the
 * font hasn't loaded (or Google doesn't serve it), each slot falls back to the
 * family it would otherwise have used, including the Capsize metric-adjusted
 * fallbacks — so text never jumps size as it loads.
 */
export const customInterfaceFonts = stylex.createTheme(fontFamily, {
  title: `var(--sr-ui-font, ${EDITORIAL_TITLE}), ${EDITORIAL_TITLE}`,
  sans: `var(--sr-ui-font, ${EDITORIAL_SANS}), ${EDITORIAL_SANS}`,
  serif: `var(--sr-ui-font, ${EDITORIAL_TITLE}), ${EDITORIAL_TITLE}`,
  mono: EDITORIAL_MONO,
});

/* -------------------------------------------------------------------------- */
/* Numeric dials                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Roundness.
 *
 * `full` rides the dial too, via a large finite radius rather than `infinity`:
 * at any scale above zero it still resolves to a pill, and at `sharp` it
 * squares off like everything else. Leaving it at `calc(infinity * 1px)` meant
 * every pill in the app — unread counts, tags, avatars — stayed round while the
 * surfaces around them went sharp, which reads as a bug rather than a choice.
 */
export const radiusScale = stylex.createTheme(radius, {
  xs: {
    default: "calc(0.3rem * var(--sr-radius-scale, 1))",
    [mediaQueries.supportsSquircle]: "calc(0.5rem * var(--sr-radius-scale, 1))",
  },
  sm: {
    default: "calc(0.4rem * var(--sr-radius-scale, 1))",
    [mediaQueries.supportsSquircle]:
      "calc(0.75rem * var(--sr-radius-scale, 1))",
  },
  md: {
    default: "calc(0.5rem * var(--sr-radius-scale, 1))",
    [mediaQueries.supportsSquircle]: "calc(1rem * var(--sr-radius-scale, 1))",
  },
  lg: {
    default: "calc(0.75rem * var(--sr-radius-scale, 1))",
    [mediaQueries.supportsSquircle]: "calc(1.5rem * var(--sr-radius-scale, 1))",
  },
  xl: {
    default: "calc(1.35rem * var(--sr-radius-scale, 1))",
    [mediaQueries.supportsSquircle]: "calc(2.5rem * var(--sr-radius-scale, 1))",
  },
  "2xl": {
    default: "calc(1.5rem * var(--sr-radius-scale, 1))",
    [mediaQueries.supportsSquircle]: "calc(3rem * var(--sr-radius-scale, 1))",
  },
  "3xl": {
    default: "calc(1.9rem * var(--sr-radius-scale, 1))",
    [mediaQueries.supportsSquircle]: "calc(3.5rem * var(--sr-radius-scale, 1))",
  },
  "4xl": {
    default: "calc(2.1rem * var(--sr-radius-scale, 1))",
    [mediaQueries.supportsSquircle]: "calc(4rem * var(--sr-radius-scale, 1))",
  },
  full: "calc(9999px * var(--sr-radius-scale, 1))",
});

/**
 * Density. Scaling the base spacing scale reaches every semantic scale derived
 * from it (padding, margin, gap) *and* the article body's own rhythm, which is
 * authored against these same tokens. `px` and `0` stay put: a hairline is a
 * hairline at any density.
 */
export const spaceScale = stylex.createTheme(spacing, {
  px: "1px",
  "0": "0px",
  "0.5": "calc(0.125rem * var(--sr-space-scale, 1))",
  "1": "calc(0.25rem * var(--sr-space-scale, 1))",
  "1.5": "calc(0.375rem * var(--sr-space-scale, 1))",
  "2": "calc(0.5rem * var(--sr-space-scale, 1))",
  "2.5": "calc(0.625rem * var(--sr-space-scale, 1))",
  "3": "calc(0.75rem * var(--sr-space-scale, 1))",
  "3.5": "calc(0.875rem * var(--sr-space-scale, 1))",
  "4": "calc(1rem * var(--sr-space-scale, 1))",
  "5": "calc(1.25rem * var(--sr-space-scale, 1))",
  "6": "calc(1.5rem * var(--sr-space-scale, 1))",
  "7": "calc(1.75rem * var(--sr-space-scale, 1))",
  "8": "calc(2rem * var(--sr-space-scale, 1))",
  "9": "calc(2.25rem * var(--sr-space-scale, 1))",
  "10": "calc(2.5rem * var(--sr-space-scale, 1))",
  "11": "calc(2.75rem * var(--sr-space-scale, 1))",
  "12": "calc(3rem * var(--sr-space-scale, 1))",
  "14": "calc(3.5rem * var(--sr-space-scale, 1))",
  "16": "calc(4rem * var(--sr-space-scale, 1))",
  "20": "calc(5rem * var(--sr-space-scale, 1))",
  "24": "calc(6rem * var(--sr-space-scale, 1))",
  "28": "calc(7rem * var(--sr-space-scale, 1))",
  "32": "calc(8rem * var(--sr-space-scale, 1))",
  "36": "calc(9rem * var(--sr-space-scale, 1))",
  "40": "calc(10rem * var(--sr-space-scale, 1))",
  "44": "calc(11rem * var(--sr-space-scale, 1))",
  "48": "calc(12rem * var(--sr-space-scale, 1))",
  "52": "calc(13rem * var(--sr-space-scale, 1))",
  "56": "calc(14rem * var(--sr-space-scale, 1))",
  "60": "calc(15rem * var(--sr-space-scale, 1))",
  "64": "calc(16rem * var(--sr-space-scale, 1))",
  "72": "calc(18rem * var(--sr-space-scale, 1))",
  "80": "calc(20rem * var(--sr-space-scale, 1))",
  "96": "calc(24rem * var(--sr-space-scale, 1))",
});

/**
 * Control, icon and avatar boxes, held out of the density dial.
 *
 * `size` is derived from `spacing`, so without this theme it would inherit the
 * density multiplier — and a control's geometry is not spacing. Components mix
 * steps freely (the switch takes its track height from one step and its width
 * from another), so scaling only part of the scale distorts them; scaling all of
 * it clips icons, whose own dimensions are fixed pixel props on the SVG.
 *
 * Density stays where it belongs: the padding, margins and gaps *between*
 * things, which is what the reader perceives as density anyway.
 *
 * The text dial isn't here either — it scales the root font size, so every rem
 * below already follows it.
 */
export const controlSizes = stylex.createTheme(size, {
  none: "0px",
  xxs: "0.625rem",
  xs: "0.75rem",
  sm: "0.875rem",
  md: "1rem",
  lg: "1.25rem",
  xl: "1.5rem",
  "2xl": "1.75rem",
  "3xl": "2rem",
  "4xl": "2.75rem",
  "5xl": "3.5rem",
  "6xl": "4rem",
  "7xl": "5rem",
  "8xl": "8rem",
  "9xl": "10rem",
  "10xl": "15rem",
  "11xl": "16rem",
  "12xl": "18rem",
});

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The color themes a palette wears. Almanac is the app's own editorial theme —
 * choosing it in `custom` mode is how a reader pins the default palette to light
 * or dark without following the OS.
 */
export function paletteThemes(palette: PaletteId) {
  switch (palette) {
    case "meadow": {
      return [sageUi, sageUiInverted, grassPrimary];
    }
    case "press": {
      return [sandUi, sandUiInverted, tomatoPrimary];
    }
    case "ink": {
      return [slateUi, slateUiInverted, indigoPrimary];
    }
    case "archive": {
      return [mauveUi, mauveUiInverted, plumPrimary];
    }
    case "tide": {
      return [slateUi, slateUiInverted, tealPrimary];
    }
    case "ember": {
      return [sandUi, sandUiInverted, amberPrimary];
    }
    case "custom": {
      return [customUi, customPrimary];
    }
    default: {
      return [editorialUi, editorialPrimary];
    }
  }
}

/** `null` keeps the editorial stack applied by the shell. */
export function interfaceFontTheme(font: AppearanceFont) {
  if (font === "sans") return sansInterfaceFonts;
  if (font === "custom") return customInterfaceFonts;
  return null;
}

/**
 * Applied in every theme mode: the dials are shape and type, not color, and
 * they no-op at their default scale.
 */
export const APPEARANCE_SCALE_THEMES = [radiusScale, spaceScale, controlSizes];
