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
/**
 * The prose measure (`docsStyles.prose`). Figures match it so an image lines up
 * with the paragraph above it instead of overhanging the column.
 */
const CONTENT_MAX = "72ch";

export const guideStyles = stylex.create({
  brandLink: {
    textDecoration: "none",
    alignItems: "center",
    display: "inline-flex",
  },
  figure: {
    marginInlineEnd: verticalSpace.none,
    marginInlineStart: verticalSpace.none,
    marginBottom: spacing["8"],
    marginTop: spacing["6"],
    maxWidth: CONTENT_MAX,
  },
  figureFrame: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: spacing["px"],
    overflow: "hidden",
    backgroundColor: uiColor.bgSubtle,
    boxShadow: shadow.sm,
    display: "flex",
    justifyContent: "center",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "100%",
    // Hug the image rather than the column, so a portrait shot doesn't sit in
    // a frame twice its width.
    width: "fit-content",
  },
  figureImage: {
    display: "block",
    height: "auto",
    // A phone-shaped screenshot is taller than it is wide, so at column width
    // it fills the screen and reads as the page rather than an illustration of
    // it. Cap it against the viewport — no spacing token is viewport-relative,
    // which is what this needs to be.
    maxHeight: "75vh",
    maxWidth: "100%",
    width: "auto",
  },
  figureCaption: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    textAlign: "center",
    marginTop: spacing["3"],
    maxWidth: "68ch",
  },
  /**
   * A magazine sets an aside apart with rules and space, not a tinted box with
   * an accent stripe down one edge — that stripe traces the corner radius and
   * peels, and it is the single most machine-made shape in a docs page. Two
   * hairlines and the label carrying the accent do the same job silently.
   */
  callout: {
    borderBlockEndColor: uiColor.border1,
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: spacing["px"],
    borderBlockStartColor: uiColor.border1,
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: spacing["px"],
    marginBottom: spacing["8"],
    marginTop: spacing["8"],
    maxWidth: CONTENT_MAX,
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
  },
  calloutTitle: {
    color: primaryColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    marginBottom: spacing["2"],
  },
  calloutBody: {
    color: uiColor.solid2,
    fontFamily: fontFamily.serif,
    lineHeight: lineHeight.base,
    marginBottom: verticalSpace.none,
  },
  steps: {
    listStyle: "none",
    color: uiColor.solid2,
    display: "grid",
    fontFamily: fontFamily.serif,
    lineHeight: lineHeight.base,
    paddingInlineStart: verticalSpace.none,
    rowGap: gap.md,
    marginBottom: spacing["6"],
    marginTop: spacing["5"],
    maxWidth: "72ch",
  },
  step: {
    columnGap: gap.md,
    display: "grid",
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
    justifyContent: "center",
    height: spacing["8"],
    width: spacing["8"],
  },
  stepBody: {
    // Text sits on the marker's optical centre rather than its box top.
    paddingTop: spacing["1"],
  },
  cardGrid: {
    columnGap: gap.md,
    display: "grid",
    gridTemplateColumns: {
      [NARROW]: "minmax(0, 1fr)",
      default: "repeat(2, minmax(0, 1fr))",
    },
    rowGap: gap.md,
    marginBottom: spacing["6"],
    marginTop: spacing["6"],
    maxWidth: GUIDE_MAX,
  },
  card: {
    borderColor: {
      default: uiColor.border1,
      ":hover": primaryColor.border2,
    },
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: spacing["px"],
    textDecoration: "none",
    backgroundColor: {
      default: uiColor.bgSubtle,
      ":hover": uiColor.component1,
    },
    display: "block",
    paddingInlineEnd: spacing["5"],
    paddingInlineStart: spacing["5"],
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color, border-color",
    transitionTimingFunction: "ease-in-out",
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
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
    columnGap: gap.md,
    display: "grid",
    gridTemplateColumns: {
      [NARROW]: "minmax(0, 1fr)",
      default: "repeat(2, minmax(0, 1fr))",
    },
    rowGap: gap.md,
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: spacing["px"],
    marginTop: spacing["16"],
    maxWidth: GUIDE_MAX,
    paddingTop: spacing["8"],
  },
  pageNavLink: {
    borderColor: {
      default: uiColor.border1,
      ":hover": primaryColor.border2,
    },
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: spacing["px"],
    textDecoration: "none",
    display: "block",
    paddingInlineEnd: spacing["5"],
    paddingInlineStart: spacing["5"],
    transitionDuration: animationDuration.fast,
    transitionProperty: "border-color",
    transitionTimingFunction: "ease-in-out",
    paddingBottom: spacing["4"],
    paddingTop: spacing["4"],
  },
  pageNavLinkNext: {
    textAlign: "end",
  },
  pageNavLabel: {
    color: uiColor.text1,
    // Both of these are spans, so without a block display the kicker and the
    // title run together on one line and the title's margin does nothing.
    display: "block",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
  },
  pageNavTitle: {
    color: primaryColor.text2,
    display: "block",
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
    paddingInlineEnd: horizontalSpace["2xl"],
    paddingInlineStart: horizontalSpace["2xl"],
    marginTop: spacing["10"],
    maxWidth: GUIDE_MAX,
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
  },
});
