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
  return (
    <span {...props} {...stylex.props(styles.root, style)}>
      Standard <span {...stylex.props(styles.accent)}>Reader</span>
    </span>
  );
}
