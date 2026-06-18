"use client";

import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "../../body-styles";

export function HorizontalRuleView({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  return (
    <hr
      {...stylex.props(
        articleBodyStyles.horizontalRule,
        embedded && articleBodyStyles.pageEmbedBlockSpacing,
      )}
    />
  );
}
