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
    alignItems: "center",
    display: "inline-flex",
    textDecoration: "none",
  },
  figure: {
    marginBottom: spacing["8"],
    marginInlineStart: verticalSpace.none,
    marginInlineEnd: verticalSpace.none,
    marginTop: spacing["6"],
    maxWidth: CONTENT_MAX,
  },
  figureFrame: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: spacing["px"],
    backgroundColor: uiColor.bgSubtle,
    boxShadow: shadow.sm,
    display: "flex",
    justifyContent: "center",
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    maxWidth: "100%",
    overflow: "hidden",
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
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    marginTop: spacing["3"],
    maxWidth: "68ch",
    textAlign: "center",
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
    marginTop: spacing["10"],
    maxWidth: GUIDE_MAX,
    paddingBottom: spacing["5"],
    paddingInlineStart: horizontalSpace["2xl"],
    paddingInlineEnd: horizontalSpace["2xl"],
    paddingTop: spacing["5"],
  },
});
