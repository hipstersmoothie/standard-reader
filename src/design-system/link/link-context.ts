import type * as stylex from "@stylexjs/stylex";

import { createContext } from "react";

export const LinkContext = createContext<{
  style?: stylex.StyleXStyles;
}>({});
