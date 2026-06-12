import * as stylex from "@stylexjs/stylex";

import { subscribeCardBorderRadius } from "./subscribe-card.constants";

/** Subscribe card / embed iframe layout tokens. */
export const subscribeCardLayout = stylex.defineVars({
  borderRadius: subscribeCardBorderRadius,
  maxWidth: "25rem",
});
