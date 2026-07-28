import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { shadow } from "@standard-reader/design-system/theme/shadow.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

/**
 * Styles unique to the reader guide. The page shell, headings, and prose come
 * from `docsStyles` (`#/components/docs/docs-page.stylex`) so both doc sets
 * share one rhythm; everything here is a shape the developer docs don't have —
 * screenshots, numbered steps, callouts, and the start-here cards.
 */

const NARROW = "@media (max-width: 47.5rem)";
const GUIDE_MAX = "56rem";

export const guideStyles = stylex.create({
  figure: {
    marginBottom: spacing["8"],
    marginInlineStart: verticalSpace.none,
    marginInlineEnd: verticalSpace.none,
    marginTop: spacing["6"],
    maxWidth: GUIDE_MAX,
  },
  figureFrame: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: spacing["px"],
    backgroundColor: uiColor.bgSubtle,
    boxShadow: shadow.sm,
    display: "block",
    overflow: "hidden",
  },
  figureImage: {
    display: "block",
    height: "auto",
    maxWidth: "100%",
    width: "100%",
  },
  figureCaption: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginTop: spacing["3"],
    maxWidth: "68ch",
  },
  callout: {
    borderInlineStartColor: primaryColor.border2,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: spacing["0.5"],
    borderRadius: radius.sm,
    backgroundColor: uiColor.bgSubtle,
    marginBottom: spacing["6"],
    marginTop: spacing["6"],
    maxWidth: "72ch",
    paddingBottom: spacing["4"],
    paddingInlineStart: spacing["5"],
    paddingInlineEnd: spacing["5"],
    paddingTop: spacing["4"],
  },
  calloutTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: "0.14em",
    marginBottom: spacing["2"],
    textTransform: "uppercase",
  },
  calloutBody: {
    color: uiColor.solid2,
    fontFamily: fontFamily.serif,
    lineHeight: lineHeight.base,
    marginBottom: verticalSpace.none,
  },
  steps: {
    color: uiColor.solid2,
    display: "grid",
    fontFamily: fontFamily.serif,
    lineHeight: lineHeight.base,
    listStyle: "none",
    marginBottom: spacing["6"],
    marginTop: spacing["5"],
    maxWidth: "72ch",
    paddingInlineStart: verticalSpace.none,
    rowGap: gap.md,
  },
  step: {
    display: "grid",
    columnGap: gap.md,
    gridTemplateColumns: `${spacing["8"]} minmax(0, 1fr)`,
  },
  stepMarker: {
    borderRadius: radius.full,
    alignItems: "center",
    backgroundColor: primaryColor.bgSubtle,
    color: primaryColor.text2,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    height: spacing["8"],
    justifyContent: "center",
    width: spacing["8"],
  },
  stepBody: {
    // Text sits on the marker's optical centre rather than its box top.
    paddingTop: spacing["1"],
  },
  cardGrid: {
    display: "grid",
    columnGap: gap.md,
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      [NARROW]: "minmax(0, 1fr)",
    },
    marginBottom: spacing["6"],
    marginTop: spacing["6"],
    maxWidth: GUIDE_MAX,
    rowGap: gap.md,
  },
  card: {
    borderColor: {
      default: uiColor.border1,
      ":hover": primaryColor.border2,
    },
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: spacing["px"],
    backgroundColor: {
      default: uiColor.bgSubtle,
      ":hover": uiColor.component1,
    },
    display: "block",
    paddingBottom: spacing["5"],
    paddingInlineStart: spacing["5"],
    paddingInlineEnd: spacing["5"],
    paddingTop: spacing["5"],
    textDecoration: "none",
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color, border-color",
    transitionTimingFunction: "ease-in-out",
  },
  cardTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    marginBottom: spacing["1.5"],
  },
  cardBlurb: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
  },
  uiLabel: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: "0.92em",
    fontWeight: fontWeight.medium,
    whiteSpace: "nowrap",
  },
  listItem: {
    marginBottom: spacing["2"],
  },
  pageNav: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: spacing["px"],
    display: "grid",
    columnGap: gap.md,
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      [NARROW]: "minmax(0, 1fr)",
    },
    marginTop: spacing["16"],
    maxWidth: GUIDE_MAX,
    paddingTop: spacing["8"],
    rowGap: gap.md,
  },
  pageNavLink: {
    borderColor: {
      default: uiColor.border1,
      ":hover": primaryColor.border2,
    },
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: spacing["px"],
    display: "block",
    paddingBottom: spacing["4"],
    paddingInlineStart: spacing["5"],
    paddingInlineEnd: spacing["5"],
    paddingTop: spacing["4"],
    textDecoration: "none",
    transitionDuration: animationDuration.fast,
    transitionProperty: "border-color",
    transitionTimingFunction: "ease-in-out",
  },
  pageNavLinkNext: {
    textAlign: "end",
  },
  pageNavLabel: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  pageNavTitle: {
    color: primaryColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginTop: spacing["1"],
  },
  helpBox: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: spacing["px"],
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    lineHeight: lineHeight.base,
    marginTop: spacing["10"],
    maxWidth: GUIDE_MAX,
    paddingBottom: spacing["5"],
    paddingInlineStart: horizontalSpace["2xl"],
    paddingInlineEnd: horizontalSpace["2xl"],
    paddingTop: spacing["5"],
  },
});
