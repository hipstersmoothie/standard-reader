import * as stylex from "@stylexjs/stylex";

import type { ThemeKeys } from "./types";

import { spacing } from "./spacing.stylex";

/**
 * Horizontal inset / margin scale (semantic keys only).
 * Numeric spacing steps 0–6 align with: none, xxs … 5xl.
 */
export const horizontalSpace = stylex.defineVars({
  none: spacing["0"],
  xxs: spacing["0.5"],
  xs: spacing["1"],
  sm: spacing["1.5"],
  md: spacing["2"],
  lg: spacing["2.5"],
  xl: spacing["3"],
  "2xl": spacing["3.5"],
  "3xl": spacing["4"],
  "4xl": spacing["5"],
  "5xl": spacing["6"],
  "6xl": spacing["7"],
  "7xl": spacing["8"],
  "8xl": spacing["10"],
  "9xl": spacing["12"],
  "10xl": spacing["16"],
  "11xl": spacing["32"],
});

/**
 * Vertical inset / margin scale (semantic keys only).
 */
export const verticalSpace = stylex.defineVars({
  none: spacing["0"],
  xxs: spacing["0.5"],
  xs: spacing["1"],
  sm: spacing["1.5"],
  md: spacing["2"],
  lg: spacing["2.5"],
  xl: spacing["3"],
  "2xl": spacing["3.5"],
  "3xl": spacing["4"],
  "4xl": spacing["5"],
  "5xl": spacing["6"],
  "6xl": spacing["7"],
  "7xl": spacing["8"],
  "8xl": spacing["10"],
  "9xl": spacing["11"],
  "10xl": spacing["12"],
  "11xl": spacing["20"],
  "12xl": spacing["24"],
});

/**
 * Gap scale: `2xl` is spacing step 4 (not 3.5); step 3.5 uses `3xl`.
 */
export const gap = stylex.defineVars({
  none: spacing["0"],
  xxs: spacing["0.5"],
  xs: spacing["1"],
  sm: spacing["1.5"],
  md: spacing["2"],
  lg: spacing["2.5"],
  xl: spacing["3"],
  "3xl": spacing["3.5"],
  "2xl": spacing["4"],
  "4xl": spacing["5"],
  "5xl": spacing["6"],
  "6xl": spacing["8"],
  "7xl": spacing["10"],
  "8xl": spacing["20"],
});

/**
 * Component size / icon box scale (semantic keys only).
 */
export const size = stylex.defineVars({
  none: spacing["0"],
  xxs: spacing["2.5"],
  xs: spacing["3"],
  sm: spacing["3.5"],
  md: spacing["4"],
  lg: spacing["5"],
  xl: spacing["6"],
  "2xl": spacing["7"],
  "3xl": spacing["8"],
  "4xl": spacing["11"],
  "5xl": spacing["14"],
  "6xl": spacing["16"],
  "7xl": spacing["20"],
  "8xl": spacing["32"],
  "9xl": spacing["40"],
  "10xl": spacing["60"],
  "11xl": spacing["64"],
  "12xl": spacing["72"],
});

// eslint-disable-next-line @stylexjs/enforce-extension
export type HorizontalSpace = ThemeKeys<typeof horizontalSpace>;
// eslint-disable-next-line @stylexjs/enforce-extension
export type VerticalSpace = ThemeKeys<typeof verticalSpace>;
// eslint-disable-next-line @stylexjs/enforce-extension
export type Gap = ThemeKeys<typeof gap>;
// eslint-disable-next-line @stylexjs/enforce-extension
export type SizeSpace = ThemeKeys<typeof size>;
