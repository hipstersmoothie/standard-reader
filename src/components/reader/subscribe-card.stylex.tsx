import * as stylex from "@stylexjs/stylex";

/** Squircle clip radius for subscribe card + embed iframe wrappers. */
export const subscribeCardBorderRadius = "1.55rem";

/** Subscribe card / embed iframe width (400px). */
export const subscribeCardLayout = stylex.defineVars({
  borderRadius: subscribeCardBorderRadius,
  maxWidth: "25rem",
});
