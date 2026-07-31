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
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

export const commentStyles = stylex.create({
  section: {
    boxSizing: "border-box",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["6"],
    maxWidth: "80ch",
    paddingBottom: spacing["20"],
    width: "100%",
  },
  list: {
    gap: gap.lg,
    display: "flex",
    flexDirection: "column",
    marginTop: verticalSpace.lg,
  },
  card: {
    borderColor: uiColor.border1,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    backgroundColor: uiColor.component1,
    color: "inherit",
    display: "block",
    paddingInlineEnd: horizontalSpace.lg,
    paddingInlineStart: horizontalSpace.lg,
    position: "relative",
    paddingBottom: verticalSpace.lg,
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
    inset: 0,
    borderRadius: "inherit",
    position: "absolute",
    zIndex: 0,
  },
  cardHeader: {
    alignItems: "center",
    columnGap: gap.md,
    display: "flex",
    position: "relative",
    rowGap: gap.md,
    zIndex: 1,
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
    unicodeBidi: "isolate",
    whiteSpace: "nowrap",
  },
  authorHandle: {
    overflow: "hidden",
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    textOverflow: "ellipsis",
    unicodeBidi: "isolate",
    whiteSpace: "nowrap",
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
    borderInlineStartColor: primaryColor.solid1,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: spacing["1"],
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    marginInlineEnd: horizontalSpace.none,
    marginInlineStart: horizontalSpace.none,
    // Quoted user content can hold unbroken runs (URIs, DIDs, long tokens) —
    // break them rather than letting the card push the page wider on mobile.
    overflowWrap: "anywhere",
    paddingInlineStart: horizontalSpace.md,
    marginBottom: verticalSpace.md,
    marginTop: spacing["0"],
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
    // Comment bodies routinely contain bare at:// URIs and long URLs with no
    // break opportunity; without this they overflow the card and the viewport.
    overflowWrap: "anywhere",
    whiteSpace: "pre-line",
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  facetMentionLink: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    // Lift above the stretched overlay link so the mention stays clickable.
    position: "relative",
    textDecorationColor: "currentColor",
    textUnderlineOffset: "2px",
    zIndex: 1,
  },
  facetLink: {
    textDecoration: { default: "underline", ":hover": "none" },
    color: primaryColor.text2,
    // Lift above the stretched overlay link so the link stays clickable.
    position: "relative",
    textUnderlineOffset: "2px",
    zIndex: 1,
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
    paddingInlineEnd: spacing["1.5"],
    paddingInlineStart: spacing["1.5"],
    paddingBottom: spacing["0.5"],
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
