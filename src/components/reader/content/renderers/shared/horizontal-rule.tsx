"use client";

import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "../../body-styles";

export function HorizontalRuleView() {
  return <hr {...stylex.props(articleBodyStyles.horizontalRule)} />;
}
