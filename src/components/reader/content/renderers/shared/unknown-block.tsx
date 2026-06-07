"use client";

import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "../../body-styles";

export function UnknownBlockView({ blockType }: { blockType: string }) {
  return (
    <p {...stylex.props(articleBodyStyles.unknownBlock)}>
      Unsupported block: {blockType}
    </p>
  );
}
