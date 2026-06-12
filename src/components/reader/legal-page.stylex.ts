import * as stylex from "@stylexjs/stylex";

import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import {
  horizontalSpace,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../../design-system/theme/typography.stylex";

const MOBILE = "@media (max-width: 47.5rem)";

export const legalPageStyles = stylex.create({
  root: {
    boxSizing: "border-box",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "640px",
    paddingBottom: {
      [MOBILE]: spacing["20"],
      default: spacing["20"],
    },
    paddingLeft: {
      [MOBILE]: horizontalSpace["3xl"],
      default: horizontalSpace["3xl"],
    },
    paddingRight: {
      [MOBILE]: horizontalSpace["3xl"],
      default: horizontalSpace["3xl"],
    },
    paddingTop: {
      [MOBILE]: verticalSpace["7xl"],
      default: verticalSpace["10xl"],
    },
    width: "100%",
  },
  head: {
    textAlign: "center",
    marginBottom: verticalSpace["7xl"],
  },
  headKicker: {
    display: "block",
    marginBottom: verticalSpace["4xl"],
  },
  title: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: {
      [MOBILE]: fontSize["4xl"],
      default: fontSize["5xl"],
    },
    fontStyle: "italic",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.xs,
    textWrap: "balance",
    marginBottom: verticalSpace["4xl"],
    marginTop: verticalSpace.none,
  },
  updated: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
  },
  body: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: {
      [MOBILE]: fontSize.lg,
      default: "1.1875rem",
    },
    lineHeight: 1.68,
  },
  paragraph: {
    marginBottom: spacing["5"],
    marginTop: verticalSpace.none,
  },
  list: {
    marginBottom: spacing["5"],
    marginTop: verticalSpace.none,
    paddingLeft: horizontalSpace["4xl"],
  },
  listItem: {
    marginBottom: verticalSpace.lg,
  },
  sectionHeading: {
    color: primaryColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginBottom: verticalSpace["3xl"],
    marginTop: verticalSpace["9xl"],
    paddingTop: verticalSpace["5xl"],
  },
  sectionHeadingPlain: {
    borderTopWidth: 0,
    marginTop: verticalSpace["5xl"],
    paddingTop: verticalSpace.none,
  },
  inlineLink: {
    font: "inherit",
    borderWidth: 0,
    backgroundColor: "transparent",
    color: primaryColor.text2,
    cursor: "pointer",
    textDecorationColor: primaryColor.component3,
    textDecorationLine: "underline",
    textDecorationThickness: "2px",
    textUnderlineOffset: spacing["1"],
    paddingBottom: verticalSpace.none,
    paddingLeft: horizontalSpace.none,
    paddingRight: horizontalSpace.none,
    paddingTop: verticalSpace.none,
  },
});
