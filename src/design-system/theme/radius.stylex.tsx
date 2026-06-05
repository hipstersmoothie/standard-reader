import * as stylex from "@stylexjs/stylex";

import { mediaQueries } from "./media-queries.stylex";

export const radius = stylex.defineVars({
  xs: {
    default: "0.3rem",
    [mediaQueries.supportsSquircle]: "0.5rem",
  },
  sm: {
    default: "0.4rem",
    [mediaQueries.supportsSquircle]: "0.75rem",
  },
  md: {
    default: "0.5rem",
    [mediaQueries.supportsSquircle]: "1rem",
  },
  lg: {
    default: "0.75rem",
    [mediaQueries.supportsSquircle]: "1.5rem",
  },
  xl: {
    default: "1.35rem",
    [mediaQueries.supportsSquircle]: "2.5rem",
  },
  "2xl": {
    default: "1.5rem",
    [mediaQueries.supportsSquircle]: "3rem",
  },
  "3xl": {
    default: "1.9rem",
    [mediaQueries.supportsSquircle]: "3.5rem",
  },
  "4xl": {
    default: "2.1rem",
    [mediaQueries.supportsSquircle]: "4rem",
  },
  full: "calc(infinity * 1px)",
});
