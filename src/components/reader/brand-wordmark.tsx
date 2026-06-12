import type { StyleXComponentProps } from "#/design-system/theme/types";

import * as stylex from "@stylexjs/stylex";
import { primaryColor, uiColor } from "#/design-system/theme/color.stylex";
import {
  fontFamily,
  fontWeight,
  lineHeight,
  tracking,
} from "#/design-system/theme/typography.stylex";

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
    color: primaryColor.text2,
  },
});

export type BrandWordmarkProps = StyleXComponentProps<
  React.ComponentProps<"span">
>;

export function BrandWordmark({ style, ...props }: BrandWordmarkProps) {
  return (
    <span {...props} {...stylex.props(styles.root, style)}>
      Standard <span {...stylex.props(styles.accent)}>Reader</span>
    </span>
  );
}
