import * as stylex from "@stylexjs/stylex";

import { animationDuration } from "#/design-system/theme/animations.stylex";
import { primaryColor, uiColor } from "#/design-system/theme/color.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "#/design-system/theme/semantic-spacing.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "#/design-system/theme/typography.stylex";

export const commentStyles = stylex.create({
  section: {
    boxSizing: "border-box",
    marginInlineStart: "auto",
    marginInlineEnd: "auto",
    maxWidth: "80ch",
    paddingBottom: spacing["20"],
    paddingInlineStart: spacing["6"],
    paddingInlineEnd: spacing["6"],
    width: "100%",
  },
  list: {
    gap: gap.lg,
    display: "flex",
    flexDirection: "column",
    marginTop: verticalSpace.lg,
  },
  card: {
    position: "relative",
    borderColor: uiColor.border1,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    backgroundColor: uiColor.component1,
    color: "inherit",
    display: "block",
    paddingBottom: verticalSpace.lg,
    paddingInlineStart: horizontalSpace.lg,
    paddingInlineEnd: horizontalSpace.lg,
    paddingTop: verticalSpace.lg,
  },
  // Only comments that link out to the original post get the hover affordance
  // — the stretched overlay link covers the whole card, so the highlight
  // should too, not just the text below the byline.
  cardLinked: {
    backgroundColor: {
      default: uiColor.component1,
      ":hover": uiColor.component2,
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color",
  },
  cardBody: {
    color: "inherit",
    display: "block",
  },
  // Full-card "open the post" link. Sits above the card background but below
  // the header and facet links, which lift themselves above it.
  cardBodyOverlay: {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    zIndex: 0,
  },
  cardHeader: {
    position: "relative",
    zIndex: 1,
    alignItems: "center",
    columnGap: gap.md,
    display: "flex",
    rowGap: gap.md,
    marginBottom: verticalSpace.md,
  },
  authorLink: {
    textDecoration: "none",
    alignItems: "center",
    color: "inherit",
    columnGap: gap.md,
    display: "flex",
    flexGrow: 1,
    flexShrink: 1,
    rowGap: gap.md,
    minWidth: 0,
  },
  authorMeta: {
    gap: gap.xs,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  authorName: {
    overflow: "hidden",
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    unicodeBidi: "isolate",
  },
  authorHandle: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    unicodeBidi: "isolate",
  },
  // Keeps a foreign-direction run (brand names, counts) from being reordered
  // against the surrounding UI text.
  bidiIsolate: {
    unicodeBidi: "isolate",
  },
  timestamp: {
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    marginInlineStart: "auto",
  },
  blockquote: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    borderInlineStartColor: primaryColor.solid1,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: spacing["1"],
    marginBottom: verticalSpace.md,
    marginInlineStart: horizontalSpace.none,
    marginInlineEnd: horizontalSpace.none,
    marginTop: spacing["0"],
    paddingInlineStart: horizontalSpace.md,
  },
  commentary: {
    gap: gap.sm,
    display: "flex",
    flexDirection: "column",
    marginBottom: verticalSpace.md,
    marginTop: spacing["0"],
  },
  commentaryParagraph: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    whiteSpace: "pre-line",
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  facetMentionLink: {
    // Lift above the stretched overlay link so the mention stays clickable.
    position: "relative",
    zIndex: 1,
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textDecorationColor: "currentColor",
    textUnderlineOffset: "2px",
  },
  facetLink: {
    // Lift above the stretched overlay link so the link stays clickable.
    position: "relative",
    zIndex: 1,
    textDecoration: { default: "underline", ":hover": "none" },
    color: primaryColor.text2,
    textUnderlineOffset: "2px",
  },
  facetBold: {
    fontWeight: fontWeight.semibold,
  },
  facetItalic: {
    fontStyle: "italic",
  },
  facetCode: {
    borderRadius: radius.sm,
    cornerShape: "squircle",
    backgroundColor: uiColor.component2,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    paddingBottom: spacing["0.5"],
    paddingInlineStart: spacing["1.5"],
    paddingInlineEnd: spacing["1.5"],
    paddingTop: spacing["0.5"],
  },
  footer: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.sm,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    rowGap: gap.sm,
  },
  empty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: verticalSpace.lg,
  },
  skeleton: {
    borderColor: uiColor.border1,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    backgroundColor: uiColor.component1,
    height: spacing["24"],
  },
});
