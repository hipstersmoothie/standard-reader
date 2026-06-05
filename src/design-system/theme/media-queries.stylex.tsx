import * as stylex from "@stylexjs/stylex";

export const breakpoints = stylex.defineConsts({
  sm: "@media (min-width: 40rem)",
  md: "@media (min-width: 48rem)",
  lg: "@media (min-width: 64rem)",
  xl: "@media (min-width: 80rem)",
  "2xl": "@media (min-width: 96rem)",
});

export const containerBreakpoints = stylex.defineConsts({
  sm: "@container (min-width: 40rem)",
  md: "@container (min-width: 48rem)",
  lg: "@container (min-width: 64rem)",
  xl: "@container (min-width: 80rem)",
  "2xl": "@container (min-width: 96rem)",
});

export const maxBreakpoints = stylex.defineConsts({
  sm: "@media (max-width: 40rem)",
});

export const mediaQueries = stylex.defineConsts({
  reducedMotion: "@media (prefers-reduced-motion: reduce)",
  supportsSquircle: "@supports (corner-shape: squircle)",
});
