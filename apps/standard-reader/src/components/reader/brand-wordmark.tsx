"use client";

import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import type { StyleXComponentProps } from "@standard-reader/design-system/theme/types";
import {
  fontFamily,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

import { useOnlineStatus } from "#/lib/use-online-status";

const styles = stylex.create({
  root: {
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxEdge: "cap alphabetic",
    // eslint-disable-next-line @stylexjs/valid-styles
    textBoxTrim: "trim-both",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "1.3rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
  },
  accent: {
    color: primaryColor.solid2,
  },
});

export type BrandWordmarkProps = StyleXComponentProps<
  React.ComponentProps<"span">
>;

export function BrandWordmark({ style, ...props }: BrandWordmarkProps) {
  const online = useOnlineStatus();
  return (
    <span {...props} {...stylex.props(styles.root, style)}>
      {/* Offline the wordmark reads "Offline Reader". It replaces a badge
          pinned to the corner of the logo, which had no good resting place —
          clear of the letterforms it pushed the brand past a narrow viewport,
          and inside them it covered the word. The state belongs in the brand
          rather than beside it: same footprint at any width, nothing to
          collide with, and it still reads as the app's own name. Untranslated,
          like the wordmark it replaces a word of. */}
      {online ? "Standard" : "Offline"}{" "}
      <span {...stylex.props(styles.accent)}>Reader</span>
    </span>
  );
}
