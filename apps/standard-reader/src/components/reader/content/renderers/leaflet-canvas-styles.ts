import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

import { canvasQueries } from "./leaflet-canvas.stylex";

/** How tall a naturally-proportioned image may render once a canvas reflows,
 *  matching `image-figure.tsx`. */
const MAX_REFLOWED_IMAGE_HEIGHT = "72vh";

/** `READING_SIZE_PULLQUOTE` in `body-styles.ts`, for a reflowed quote. */
const REFLOWED_QUOTE_SIZE = "1.6875rem";

/** An image or drawing that reflowed keeps no more than its canvas width. */
const REFLOWED_MEDIA_MAX_WIDTH = "min(100%, calc(var(--sr-item-width) * 1px))";

/**
 * Overrides for blocks drawn inside a canvas block. On the canvas they size to
 * Leaflet's own canvas px — a 16px base, an 8px paragraph gap, headings at
 * 2 / 1.625 / 1.125em — because their positions were authored against that
 * text: reading-column type would wrap longer and overlap the block below.
 * These are canvas coordinates, scaled with the whole canvas, so they are px
 * rather than the rem tokens the reading column uses. Once the canvas reflows
 * (`canvasQueries.reflow`) every block returns to its reading-column style.
 */
export const canvasBlockStyles = stylex.create({
  paragraph: {
    marginBottom: {
      default: "8px",
      [canvasQueries.reflow]: spacing["6"],
    },
  },
  textSmall: {
    color: uiColor.text1,
    fontSize: "0.875em",
  },
  textLarge: {
    fontSize: "1.125em",
  },
  // Each heading level restates its reading-column values for the reflowed
  // branch: a later style replaces the whole property, so `null` there would
  // drop the column's margins rather than fall back to them.
  heading1: {
    fontSize: { default: "2em", [canvasQueries.reflow]: fontSize["2xl"] },
    lineHeight: { default: 1.25, [canvasQueries.reflow]: 1.2 },
    marginBottom: { default: "4px", [canvasQueries.reflow]: spacing["4"] },
    marginTop: { default: "4px", [canvasQueries.reflow]: spacing["10"] },
  },
  heading2: {
    fontSize: { default: "1.625em", [canvasQueries.reflow]: fontSize.xl },
    lineHeight: 1.25,
    marginBottom: { default: "4px", [canvasQueries.reflow]: spacing["3"] },
    marginTop: { default: "4px", [canvasQueries.reflow]: spacing["8"] },
  },
  heading3: {
    fontSize: { default: "1.125em", [canvasQueries.reflow]: fontSize.xl },
    lineHeight: 1.25,
    marginBottom: { default: "4px", [canvasQueries.reflow]: spacing["3"] },
    marginTop: { default: "4px", [canvasQueries.reflow]: spacing["8"] },
  },
  // Leaflet's canvas quote is body-size text behind a 2px rule; the reading
  // column's pull quote (restated for the reflowed branch) would run several
  // lines longer and over the block below.
  blockquote: {
    borderInlineStartWidth: { default: "2px", [canvasQueries.reflow]: 3 },
    fontFamily: {
      default: "inherit",
      [canvasQueries.reflow]: fontFamily.serif,
    },
    fontSize: {
      default: "1em",
      [canvasQueries.reflow]: REFLOWED_QUOTE_SIZE,
    },
    fontStyle: { default: "normal", [canvasQueries.reflow]: "italic" },
    fontWeight: {
      default: "inherit",
      [canvasQueries.reflow]: fontWeight.medium,
    },
    lineHeight: { default: "inherit", [canvasQueries.reflow]: 1.32 },
    marginBottom: { default: "8px", [canvasQueries.reflow]: spacing["9"] },
    marginTop: { default: "4px", [canvasQueries.reflow]: spacing["9"] },
    paddingBottom: {
      default: spacing["0"],
      [canvasQueries.reflow]: spacing["1"],
    },
    paddingInlineStart: {
      default: "12px",
      [canvasQueries.reflow]: spacing["6"],
    },
    paddingTop: { default: spacing["0"], [canvasQueries.reflow]: spacing["1"] },
  },
  figure: {
    marginBottom: {
      default: spacing["0"],
      [canvasQueries.reflow]: spacing["6"],
    },
  },
  image: {
    maxHeight: {
      default: "none",
      [canvasQueries.reflow]: MAX_REFLOWED_IMAGE_HEIGHT,
    },
    maxWidth: {
      default: "100%",
      [canvasQueries.reflow]: REFLOWED_MEDIA_MAX_WIDTH,
    },
    width: { default: "100%", [canvasQueries.reflow]: "auto" },
  },
  drawing: {
    maxWidth: {
      default: "none",
      [canvasQueries.reflow]: REFLOWED_MEDIA_MAX_WIDTH,
    },
  },
});
