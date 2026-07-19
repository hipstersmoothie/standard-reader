import * as stylex from "@stylexjs/stylex";
import type { CSSProperties } from "react";

import {
  primaryColor,
  uiColor,
  warningColor,
} from "#/design-system/theme/color.stylex";
import { radius } from "#/design-system/theme/radius.stylex";
import { gap, size } from "#/design-system/theme/semantic-spacing.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
} from "#/design-system/theme/typography.stylex";
import type { ReadingTypographyPreference } from "#/lib/reading-typography";
import { readingCustomFontFamily } from "#/lib/reading-typography";

/**
 * Border width of `iframeFrame`. Exported so callers that set an explicit
 * pixel height on the frame can add it back: the frame is `border-box`, so a
 * bare `height: 352px` leaves the iframe only 350px of content box, and some
 * embeds (Spotify switches to its compact player below 352px) change layout
 * over a couple of pixels.
 */
export const IFRAME_FRAME_BORDER_WIDTH = 1;

export const articleBodyStyles = stylex.create({
  body: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: { default: "1.1875rem", "@media (min-width: 40rem)": "1.25rem" },
    lineHeight: 1.68,
    marginTop: spacing["9"],
    minWidth: 0,
  },
  bodyAfterHero: {
    marginTop: spacing["0"],
  },
  paragraph: {
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
  },
  /** First paragraph: contain floated drop cap so short openings clear the letter. */
  dropCapParagraph: {
    display: "flow-root",
    minHeight: `calc(3.6em * 0.78 + ${spacing["1.5"]})`,
  },
  dropCap: {
    color: primaryColor.text2,
    // Deliberately PHYSICAL, not `inline-start`.
    //
    // `float: inline-start` is not Baseline 2024, so lightningcss downlevels it
    // to `html:not([dir=rtl]) .x { float: left }` / `html[dir=rtl] .x { float:
    // right }`. Those selectors key off the DOCUMENT direction and therefore
    // ignore the `dir="auto"` we set on the article body — the drop cap would
    // flip to the right for an English article merely because the UI is Arabic.
    //
    // Article text has no language metadata, so `dir="auto"` resolves it from
    // content; the float has to match that, and CSS can't select on a resolved
    // auto-direction. Physical `left` is correct for every article we can
    // currently render. Revisit if documents gain a real language field.
    float: "left",
    fontFamily: fontFamily.serif,
    fontSize: "3.6em",
    fontStyle: "italic",
    fontWeight: fontWeight.semibold,
    lineHeight: 0.78,
    paddingBottom: spacing["0"],
    paddingInlineStart: spacing["0"],
    paddingInlineEnd: spacing["3"],
    paddingTop: spacing["1.5"],
  },
  callout: {
    borderRadius: radius.md,
    gap: gap.md,
    alignItems: "flex-start",
    backgroundColor: uiColor.component1,
    display: "flex",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    paddingBottom: spacing["4"],
    paddingInlineStart: spacing["4"],
    paddingInlineEnd: spacing["4"],
    paddingTop: spacing["4"],
  },
  calloutEmoji: {
    flexShrink: 0,
    fontSize: fontSize.lg,
    lineHeight: 1.4,
    marginTop: spacing["0.5"],
  },
  calloutBody: {
    flexBasis: "0",
    flexGrow: 1,
    flexShrink: 1,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    minWidth: 0,
  },
  pullquote: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "1.6875rem",
    fontStyle: "italic",
    fontWeight: fontWeight.medium,
    lineHeight: 1.32,
    // eslint-disable-next-line @stylexjs/valid-styles
    textWrap: "pretty",
    borderInlineStartColor: primaryColor.solid1,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 3,
    marginBottom: spacing["9"],
    marginTop: spacing["9"],
    paddingBottom: spacing["1"],
    paddingInlineStart: spacing["6"],
    paddingInlineEnd: spacing["0"],
    paddingTop: spacing["1"],
  },
  facetBold: {
    fontWeight: fontWeight.semibold,
  },
  facetItalic: {
    fontStyle: "italic",
  },
  facetLink: {
    textDecoration: { default: "underline", ":hover": "none" },
    color: primaryColor.text2,
    textUnderlineOffset: spacing["1.5"],
  },
  publicationBylineLink: {
    cornerShape: "squircle",
    borderRadius: radius.xs,
    textDecoration: { default: "underline", ":hover": "none" },
    color: primaryColor.text2,
    textDecorationColor: "currentColor",
    textUnderlineOffset: spacing["1.5"],
    fontWeight: fontWeight.semibold,
  },
  facetMentionLink: {
    cornerShape: "squircle",
    borderRadius: radius.xs,
    textDecoration: "none",
    backgroundColor: {
      default: primaryColor.component1,
      ":is([data-hovered=true])": primaryColor.component2,
    },
    fontWeight: fontWeight.medium,
    color: primaryColor.text2,
    textDecorationColor: "currentColor",
    textUnderlineOffset: spacing["1.5"],
    paddingBlock: spacing["1.5"],
    paddingInline: spacing["2"],
  },
  facetCode: {
    borderRadius: radius.sm,
    backgroundColor: uiColor.component1,
    fontFamily: fontFamily.mono,
    fontSize: "0.88em",
    paddingBottom: spacing["0.5"],
    paddingInlineStart: spacing["1.5"],
    paddingInlineEnd: spacing["1.5"],
    paddingTop: spacing["0.5"],
  },
  /** Inline footnote reference marker (superscript number). `lineHeight: 0`
   * keeps the superscript from stretching the line it sits on. */
  footnoteRef: {
    fontSize: "0.7em",
    lineHeight: 0,
    verticalAlign: "super",
  },
  footnoteRefLink: {
    cornerShape: "squircle",
    borderRadius: radius.xs,
    textDecoration: "none",
    color: primaryColor.text2,
    fontWeight: fontWeight.medium,
    paddingInline: spacing["0.5"],
  },
  /** Endnotes list at the foot of the article body. */
  footnotes: {
    marginTop: spacing["10"],
  },
  footnotesDivider: {
    borderStyle: "none",
    backgroundColor: uiColor.border1,
    height: 1,
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    width: "100%",
  },
  footnotesList: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: 1.6,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    paddingInlineStart: spacing["6"],
  },
  footnotesItem: {
    marginBottom: gap.sm,
    marginTop: spacing["0"],
    // Keep the anchored note clear of any sticky reading chrome when jumped to.
    scrollMarginTop: spacing["10"],
  },
  footnoteBackLink: {
    textDecoration: "none",
    color: primaryColor.text2,
    marginInlineStart: spacing["1"],
  },
  codeBlock: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.component1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    lineHeight: 1.5,
    whiteSpace: "pre",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    overflowX: "auto",
    paddingBottom: spacing["4"],
    paddingInlineStart: spacing["4"],
    paddingInlineEnd: spacing["4"],
    paddingTop: spacing["4"],
  },
  /** Highlighted blocks: shell only — padding lives on the inner Shiki `<pre>`. */
  codeBlockShell: {
    "--code-block-padding": spacing["4"],
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    lineHeight: 1.5,
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    overflowX: "auto",
  },
  iframeFigure: {
    marginBottom: spacing["6"],
    marginInlineStart: spacing["0"],
    marginInlineEnd: spacing["0"],
    marginTop: spacing["0"],
    maxWidth: "100%",
    minWidth: 0,
    width: "100%",
  },
  iframeFrame: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    // Keep in sync with `IFRAME_FRAME_BORDER_WIDTH`; the stylex lint rule
    // can't resolve an identifier here.
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: uiColor.component1,
    position: "relative",
    maxWidth: "100%",
    minWidth: 0,
    width: "100%",
  },
  iframeEmbed: {
    borderStyle: "none",
    display: "block",
    position: "absolute",
    height: "100%",
    insetInlineStart: spacing["0"],
    top: spacing["0"],
    width: "100%",
  },
  heading1: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semibold,
    lineHeight: 1.2,
    // eslint-disable-next-line @stylexjs/valid-styles
    textWrap: "pretty",
    marginBottom: spacing["4"],
    marginTop: spacing["10"],
  },
  heading2: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: 1.25,
    // eslint-disable-next-line @stylexjs/valid-styles
    textWrap: "pretty",
    marginBottom: spacing["3"],
    marginTop: spacing["8"],
  },
  list: {
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    paddingInlineStart: spacing["6"],
  },
  listItem: {
    marginBottom: gap.sm,
    marginTop: spacing["0"],
  },
  horizontalRule: {
    borderStyle: "none",
    backgroundColor: uiColor.border1,
    height: 1,
    marginBottom: spacing["8"],
    marginTop: spacing["8"],
    width: "100%",
  },
  separator: {
    borderStyle: "none",
    backgroundColor: uiColor.border1,
    opacity: 0.6,
    height: 1,
    marginBottom: spacing["6"],
    marginTop: spacing["6"],
    width: "100%",
  },
  mathBlock: {
    textAlign: "center",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    overflowX: "auto",
    width: "100%",
  },
  mathFallback: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    whiteSpace: "pre-wrap",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    overflowX: "auto",
  },
  buttonRow: {
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
  },
  buttonCaption: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    marginBottom: gap.sm,
    marginTop: spacing["0"],
  },
  alignLeft: {
    textAlign: "start",
  },
  alignCenter: {
    textAlign: "center",
  },
  alignRight: {
    textAlign: "end",
  },
  imageDiff: {
    borderRadius: radius.md,
    overflow: "hidden",
    position: "relative",
    touchAction: "none",
    userSelect: "none",
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    width: "100%",
  },
  imageDiffImage: {
    display: "block",
    objectFit: "cover",
    height: "100%",
    width: "100%",
  },
  imageDiffBeforeClip: {
    overflow: "hidden",
    position: "absolute",
    bottom: spacing["0"],
    insetInlineStart: spacing["0"],
    insetInlineEnd: spacing["0"],
    top: spacing["0"],
  },
  imageDiffHandle: {
    backgroundColor: uiColor.component1,
    boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.15)",
    pointerEvents: "none",
    position: "absolute",
    transform: "translateX(-50%)",
    bottom: spacing["0"],
    top: spacing["0"],
    width: 2,
  },
  imageDiffSlider: {
    inset: spacing["0"],
    margin: spacing["0"],
    cursor: "ew-resize",
    opacity: 0,
    position: "absolute",
    height: "100%",
    width: "100%",
  },
  imageDiffLabelBefore: {
    borderRadius: radius.sm,
    backgroundColor: uiColor.component1,
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    pointerEvents: "none",
    position: "absolute",
    insetInlineStart: gap.sm,
    paddingBottom: spacing["1"],
    paddingInlineStart: spacing["2"],
    paddingInlineEnd: spacing["2"],
    paddingTop: spacing["1"],
    top: gap.sm,
  },
  imageDiffLabelAfter: {
    borderRadius: radius.sm,
    backgroundColor: uiColor.component1,
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    pointerEvents: "none",
    position: "absolute",
    paddingBottom: spacing["1"],
    paddingInlineStart: spacing["2"],
    paddingInlineEnd: spacing["2"],
    paddingTop: spacing["1"],
    insetInlineEnd: gap.sm,
    top: gap.sm,
  },
  pollCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.component1,
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    paddingBottom: spacing["4"],
    paddingInlineStart: spacing["4"],
    paddingInlineEnd: spacing["4"],
    paddingTop: spacing["4"],
  },
  pollTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: gap.sm,
    marginTop: spacing["0"],
  },
  pollOptions: {
    listStyle: "none",
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    paddingInlineStart: spacing["0"],
  },
  pollOption: {
    borderColor: uiColor.border1,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    marginBottom: gap.sm,
    marginTop: spacing["0"],
    paddingBottom: spacing["2"],
    paddingInlineStart: spacing["3"],
    paddingInlineEnd: spacing["3"],
    paddingTop: spacing["2"],
  },
  imageFigure: {
    overflow: "hidden",
    boxSizing: "border-box",
    marginBottom: spacing["6"],
    marginInlineStart: spacing["0"],
    marginInlineEnd: spacing["0"],
    marginTop: spacing["0"],
    maxWidth: "100%",
    minWidth: 0,
    width: "100%",
  },
  imageFullBleed: {
    marginInlineStart: `calc(-1 * ${spacing["6"]})`,
    marginInlineEnd: `calc(-1 * ${spacing["6"]})`,
    maxWidth: "none",
    width: `calc(100% + 2 * ${spacing["6"]})`,
  },
  imageCaption: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    lineHeight: 1.2,
    marginBottom: spacing["0"],
    marginTop: gap.md,
    textAlign: "center",
  },
  gallery: {
    marginBottom: spacing["6"],
    marginInlineStart: spacing["0"],
    marginInlineEnd: spacing["0"],
    marginTop: spacing["0"],
    maxWidth: "100%",
    minWidth: 0,
    width: "100%",
  },
  galleryTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: gap.md,
    marginTop: spacing["0"],
  },
  galleryCaption: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    marginBottom: spacing["0"],
    marginTop: gap.md,
  },
  galleryGrid: {
    gap: gap.md,
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 40rem)": "repeat(2, minmax(0, 1fr))",
    },
  },
  galleryList: {
    gap: gap.md,
    display: "flex",
    flexDirection: "column",
  },
  galleryCarousel: {
    WebkitOverflowScrolling: "touch",
    gap: gap.md,
    scrollSnapType: "x mandatory",
    display: "flex",
    overflowX: "auto",
  },
  galleryCarouselItem: {
    flexShrink: 0,
    scrollSnapAlign: "start",
    width: {
      default: "85%",
      "@media (min-width: 40rem)": "60%",
    },
  },
  galleryMasonry: {
    columns: {
      default: 1,
      "@media (min-width: 40rem)": 2,
    },
    columnGap: gap.md,
  },
  galleryMasonryItem: {
    breakInside: "avoid",
    marginBottom: gap.md,
  },
  gallerySkeleton: {
    borderRadius: radius.md,
    aspectRatio: "16 / 9",
    backgroundColor: uiColor.component1,
    width: "100%",
  },
  bskyPostEmbed: {
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    maxWidth: "100%",

    // oxlint-disable-next-line @stylexjs/no-legacy-contextual-styles, @stylexjs/valid-styles
    ":is(*) a": {
      textDecoration: "inherit",
      color: "inherit",
    },
  },
  table: {
    borderCollapse: "collapse",
    fontSize: fontSize.sm,
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    width: "100%",
  },
  tableCell: {
    borderColor: uiColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
    verticalAlign: "top",
    paddingBottom: spacing["2"],
    paddingInlineStart: spacing["3"],
    paddingInlineEnd: spacing["3"],
    paddingTop: spacing["2"],
  },
  tableHeaderCell: {
    backgroundColor: uiColor.component1,
    fontWeight: fontWeight.semibold,
  },
  websiteCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
    textDecoration: "none",
    backgroundColor: uiColor.component1,
    display: "block",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
  },
  websiteCardBody: {
    gap: gap.md,
    alignItems: "center",
    display: "flex",
    paddingBottom: spacing["4"],
    paddingInlineStart: spacing["4"],
    paddingInlineEnd: spacing["6"],
    paddingTop: spacing["4"],
  },
  websiteCardText: {
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minWidth: 0,
  },
  websiteCardExternalIcon: {
    color: uiColor.text1,
    display: "flex",
    flexShrink: 0,
    height: size.sm,
    width: size.sm,
  },
  pageEmbedDisclosure: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.component1,
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
  },
  pageEmbedPanelContent: {
    gap: gap.sm,
    color: uiColor.text2,
    display: "flex",
    flexDirection: "column",
    fontFamily: fontFamily.serif,
    fontSize: { default: "1.1875rem", "@media (min-width: 40rem)": "1.25rem" },
    lineHeight: 1.68,
    paddingBottom: spacing["4"],
    paddingInlineStart: spacing["4"],
    paddingInlineEnd: spacing["4"],
    paddingTop: gap.sm,
  },
  pageEmbedBlockSpacing: {
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  pageEmbedBlockInner: {
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  websiteCardTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: gap.sm,
    marginTop: spacing["0"],
  },
  websiteCardDescription: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  websiteCardImage: {
    display: "block",
    objectFit: "cover",
    height: "auto",
    maxHeight: "240px",
    width: "100%",
  },
  facetUnderline: {
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  facetStrikethrough: {
    textDecoration: "line-through",
  },
  facetHighlight: {
    borderRadius: radius.xs,
    paddingBlock: spacing["0.5"],
    backgroundColor: warningColor.component2,
    // eslint-disable-next-line @stylexjs/valid-styles
    boxDecorationBreak: "clone",
    color: warningColor.text2,
  },
  quoteShareMark: {
    borderRadius: radius.xs,
    cornerShape: "squircle",
    paddingBlock: spacing["0.5"],
    backgroundColor: primaryColor.component3,
    // eslint-disable-next-line @stylexjs/valid-styles
    boxDecorationBreak: "clone",
    color: "inherit",
  },
  taskList: {
    listStyle: "none",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    paddingInlineStart: spacing["0"],
  },
  taskItem: {
    gap: gap.sm,
    alignItems: "flex-start",
    display: "flex",
    marginBottom: gap.sm,
    marginTop: spacing["0"],
  },
  taskCheckbox: {
    flexShrink: 0,
    marginTop: spacing["1"],
  },
  unknownBlock: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "dashed",
    borderWidth: 1,
    backgroundColor: uiColor.component1,
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    paddingBottom: spacing["3"],
    paddingInlineStart: spacing["4"],
    paddingInlineEnd: spacing["4"],
    paddingTop: spacing["3"],
  },
  /** Wade Minter–style playlist cards embedded as HTML in Standard markdown. */
  playlistSongs: {
    gap: gap.lg,
    display: "flex",
    flexDirection: "column",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
  },
  playlistSong: {
    gap: gap.md,
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "row",
  },
  playlistSongNumber: {
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    minWidth: spacing["6"],
    paddingTop: spacing["1"],
  },
  playlistSongArtwork: {
    borderRadius: radius.sm,
    flexShrink: 0,
    objectFit: "cover",
    height: size["6xl"],
    width: size["6xl"],
  },
  playlistSongCopy: {
    flexBasis: "0",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  bodyFontSizeSmall: {
    fontSize: { default: "1rem", "@media (min-width: 40rem)": "1.0625rem" },
  },
  bodyFontSizeLarge: {
    fontSize: {
      default: "1.3125rem",
      "@media (min-width: 40rem)": "1.375rem",
    },
  },
  bodyFontSans: {
    fontFamily: fontFamily.sans,
  },
});

export const articleMeasureStyles = stylex.create({
  narrow: {
    maxWidth: "65ch",
  },
  default: {
    maxWidth: "80ch",
  },
  wide: {
    maxWidth: "95ch",
  },
});

export function readingBodyStyles(
  preference: ReadingTypographyPreference,
  hasHero?: boolean,
) {
  return [
    articleBodyStyles.body,
    hasHero ? articleBodyStyles.bodyAfterHero : undefined,
    preference.fontSize === "small"
      ? articleBodyStyles.bodyFontSizeSmall
      : undefined,
    preference.fontSize === "large"
      ? articleBodyStyles.bodyFontSizeLarge
      : undefined,
    preference.bodyFont === "sans" ? articleBodyStyles.bodyFontSans : undefined,
  ] as const;
}

type StyleXProps = ReturnType<typeof stylex.props>;

export function readingBodyCustomFontStyle(
  preference: ReadingTypographyPreference,
): CSSProperties | undefined {
  const family = readingCustomFontFamily(preference);
  if (!family) return undefined;
  return { fontFamily: `"${family}", serif` };
}

function mergeStylexProps(
  props: StyleXProps,
  extraStyle?: CSSProperties,
): StyleXProps {
  if (!extraStyle) return props;
  const current = props as StyleXProps & { style?: CSSProperties };
  return {
    ...current,
    style: { ...current.style, ...extraStyle },
  };
}

export function readingBodyStyleProps(
  preference: ReadingTypographyPreference,
  hasHero?: boolean,
  ...extra: ReadonlyArray<stylex.StyleXStyles | false | undefined | null>
) {
  return mergeStylexProps(
    stylex.props(...readingBodyStyles(preference, hasHero), ...extra),
    readingBodyCustomFontStyle(preference),
  );
}

export function readingDropCapStyleProps(
  preference: ReadingTypographyPreference,
) {
  const customStyle = readingBodyCustomFontStyle(preference);
  if (customStyle) {
    return mergeStylexProps(
      stylex.props(articleBodyStyles.dropCap),
      customStyle,
    );
  }
  if (preference.bodyFont === "sans") {
    return stylex.props(
      articleBodyStyles.dropCap,
      articleBodyStyles.bodyFontSans,
    );
  }
  return stylex.props(articleBodyStyles.dropCap);
}

export function articleMeasureStyle(preference: ReadingTypographyPreference) {
  return articleMeasureStyles[preference.measure];
}
