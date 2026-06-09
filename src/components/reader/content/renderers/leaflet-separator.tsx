"use client";

import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "../body-styles";

export function LeafletSeparatorView() {
  return <hr {...stylex.props(articleBodyStyles.separator)} />;
}
