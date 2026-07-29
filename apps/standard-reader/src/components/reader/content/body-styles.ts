import {
  linkColor,
  primaryColor,
  uiColor,
  warningColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  size,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import type { CSSProperties } from "react";

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

/**
 * Line height of the article reading column. Shared so that anything which
 * has to align to a line of body copy — task-list checkboxes, hanging
 * markers — can do the arithmetic against the same number instead of
 * hard-coding a second copy that silently drifts.
 */
const READING_LINE_HEIGHT = 1.68;

/** Edge length of a task-list checkbox, relative to the reading font size. */
const TASK_CHECKBOX_SIZE = "0.75em";

/**
 * Reading sizes, in rem so the appearance text-size dial carries them: that dial
 * scales the root font size, which is what makes one setting move the chrome and
 * the prose together. The reading-typography preference then picks between the
 * small / default / large sets below, on top of that baseline.
 */
const READING_SIZE_DEFAULT = "1.1875rem";
const READING_SIZE_DEFAULT_WIDE = "1.25rem";
const READING_SIZE_SMALL = "1rem";
const READING_SIZE_SMALL_WIDE = "1.0625rem";
const READING_SIZE_LARGE = "1.3125rem";
const READING_SIZE_LARGE_WIDE = "1.375rem";
const READING_SIZE_PULLQUOTE = "1.6875rem";

/** Atkinson, stated literally — see `bodyFontSans`. */
const READING_SANS_STACK =
  "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible Next Fallback: -apple-system', 'Atkinson Hyperlegible Next Fallback: Arial', system-ui, -apple-system, sans-serif";

export const articleBodyStyles = stylex.create({
  body: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: {
      default: READING_SIZE_DEFAULT,
      "@media (min-width: 40rem)": READING_SIZE_DEFAULT_WIDE,
    },
    lineHeight: READING_LINE_HEIGHT,
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
    paddingInlineEnd: spacing["3"],
    paddingInlineStart: spacing["0"],
    paddingBottom: spacing["0"],
    paddingTop: spacing["1.5"],
  },
  callout: {
    borderRadius: radius.md,
    gap: gap.md,
    alignItems: "flex-start",
    backgroundColor: uiColor.component1,
    display: "flex",
    paddingInlineEnd: spacing["4"],
    paddingInlineStart: spacing["4"],
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    paddingBottom: spacing["4"],
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
    borderInlineStartColor: primaryColor.solid1,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 3,
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: READING_SIZE_PULLQUOTE,
    fontStyle: "italic",
    fontWeight: fontWeight.medium,
    lineHeight: 1.32,
    paddingInlineEnd: spacing["0"],
    paddingInlineStart: spacing["6"],
    // eslint-disable-next-line @stylexjs/valid-styles
    textWrap: "pretty",
    marginBottom: spacing["9"],
    marginTop: spacing["9"],
    paddingBottom: spacing["1"],
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
    color: linkColor.text,
    textUnderlineOffset: spacing["1.5"],
  },
  publicationBylineLink: {
    borderRadius: radius.xs,
    cornerShape: "squircle",
    textDecoration: { default: "underline", ":hover": "none" },
    color: linkColor.text,
    fontWeight: fontWeight.semibold,
    textDecorationColor: "currentColor",
    textUnderlineOffset: spacing["1.5"],
  },
  /**
   * Inline mention chip — an entity's avatar + name rendered as a pill inside
   * prose. The label is arbitrary author content (publication names, document
   * titles), so the chip wraps like the text around it; pinning it to one line
   * pushed long Leaflet titles past the reading column and off the screen on
   * mobile.
   */
  facetMentionLink: {
    borderRadius: radius.xs,
    cornerShape: "squircle",
    paddingBlock: spacing["1.5"],
    paddingInline: spacing["2"],
    textDecoration: "none",
    backgroundColor: {
      default: primaryColor.component1,
      ":is([data-hovered=true])": primaryColor.component2,
    },
    // Give each line fragment of a wrapped chip its own padding and rounded
    // corners, so it still reads as a pill and not a sliced rectangle.
    // eslint-disable-next-line @stylexjs/valid-styles
    boxDecorationBreak: "clone",
    color: primaryColor.text2,
    fontWeight: fontWeight.medium,
    // Labels that are one unbroken run (long handles, URL-ish names) have no
    // wrap opportunity of their own; break inside them rather than overflow.
    overflowWrap: "break-word",
    textDecorationColor: "currentColor",
    textUnderlineOffset: spacing["1.5"],
    whiteSpace: "normal",
  },
  /** Shrinks the design-system Avatar to sit inline with body text. */
  facetMentionAvatar: {
    display: "inline-flex",
    marginInlineEnd: "0.25em",
    verticalAlign: "-0.2em",
    height: "1.05em",
    width: "1.05em",
  },
  facetCode: {
    borderRadius: radius.sm,
    backgroundColor: uiColor.component1,
    fontFamily: fontFamily.mono,
    fontSize: "0.88em",
    paddingInlineEnd: spacing["1.5"],
    paddingInlineStart: spacing["1.5"],
    paddingBottom: spacing["0.5"],
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
    borderRadius: radius.xs,
    cornerShape: "squircle",
    paddingInline: spacing["0.5"],
    textDecoration: "none",
    color: linkColor.text,
    fontWeight: fontWeight.medium,
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
    paddingInlineStart: spacing["6"],
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  footnotesItem: {
    marginBottom: gap.sm,
    marginTop: spacing["0"],
    // Keep the anchored note clear of any sticky reading chrome when jumped to.
    scrollMarginTop: spacing["10"],
  },
  footnoteBackLink: {
    textDecoration: "none",
    color: linkColor.text,
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
    paddingInlineEnd: spacing["4"],
    paddingInlineStart: spacing["4"],
    whiteSpace: "pre",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    overflowX: "auto",
    paddingBottom: spacing["4"],
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
    marginInlineEnd: spacing["0"],
    marginInlineStart: spacing["0"],
    marginBottom: spacing["6"],
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
    insetInlineStart: spacing["0"],
    position: "absolute",
    height: "100%",
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
    paddingInlineStart: spacing["6"],
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
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
    insetInlineEnd: spacing["0"],
    insetInlineStart: spacing["0"],
    position: "absolute",
    bottom: spacing["0"],
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
    insetInlineStart: gap.sm,
    paddingInlineEnd: spacing["2"],
    paddingInlineStart: spacing["2"],
    pointerEvents: "none",
    position: "absolute",
    paddingBottom: spacing["1"],
    paddingTop: spacing["1"],
    top: gap.sm,
  },
  imageDiffLabelAfter: {
    borderRadius: radius.sm,
    backgroundColor: uiColor.component1,
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    insetInlineEnd: gap.sm,
    paddingInlineEnd: spacing["2"],
    paddingInlineStart: spacing["2"],
    pointerEvents: "none",
    position: "absolute",
    paddingBottom: spacing["1"],
    paddingTop: spacing["1"],
    top: gap.sm,
  },
  pollCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.component1,
    paddingInlineEnd: spacing["4"],
    paddingInlineStart: spacing["4"],
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    paddingBottom: spacing["4"],
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
    paddingInlineStart: spacing["0"],
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  pollOption: {
    borderColor: uiColor.border1,
    borderRadius: radius.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    paddingInlineEnd: spacing["3"],
    paddingInlineStart: spacing["3"],
    marginBottom: gap.sm,
    marginTop: spacing["0"],
    paddingBottom: spacing["2"],
    paddingTop: spacing["2"],
  },
  imageFigure: {
    overflow: "hidden",
    boxSizing: "border-box",
    marginInlineEnd: spacing["0"],
    marginInlineStart: spacing["0"],
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    maxWidth: "100%",
    minWidth: 0,
    width: "100%",
  },
  imageFullBleed: {
    marginInlineEnd: `calc(-1 * ${spacing["6"]})`,
    marginInlineStart: `calc(-1 * ${spacing["6"]})`,
    maxWidth: "none",
    width: `calc(100% + 2 * ${spacing["6"]})`,
  },
  imageCaption: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    lineHeight: 1.2,
    textAlign: "center",
    marginBottom: spacing["0"],
    marginTop: gap.md,
  },
  gallery: {
    marginInlineEnd: spacing["0"],
    marginInlineStart: spacing["0"],
    marginBottom: spacing["6"],
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
    paddingInlineEnd: spacing["3"],
    paddingInlineStart: spacing["3"],
    verticalAlign: "top",
    paddingBottom: spacing["2"],
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
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["4"],
    paddingBottom: spacing["4"],
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
    fontSize: {
      default: READING_SIZE_DEFAULT,
      "@media (min-width: 40rem)": READING_SIZE_DEFAULT_WIDE,
    },
    lineHeight: READING_LINE_HEIGHT,
    paddingInlineEnd: spacing["4"],
    paddingInlineStart: spacing["4"],
    paddingBottom: spacing["4"],
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
    maxHeight: "15rem",
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
    paddingInlineStart: spacing["0"],
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
  },
  taskItem: {
    gap: gap.md,
    alignItems: "flex-start",
    display: "flex",
    marginBottom: gap.sm,
    marginTop: spacing["0"],
  },
  /**
   * Sized and centred against the reading type rather than the browser
   * default. A bare checkbox is ~13px at whatever font-size the UA gives an
   * `input`, so at the article's reading rhythm the old fixed `margin-top`
   * left it floating near the top of the line box, well above the letterforms
   * it labels. `font-size: inherit` makes `em` and `lh` resolve against the
   * reading size, so the box scales with the reader's type preference and
   * centres on its item's first line at any size. `lh` is the accurate unit
   * but is unsupported in older Safari, hence the `em` fallback computed from
   * the same line height the body uses.
   *
   * `line-height: inherit` is load-bearing, not tidiness: the UA sets
   * `line-height: normal` on `input`, so without it `1lh` resolves against the
   * control's own ~1.2 normal rather than the reading column's, and the box
   * lands 7px high — the original bug.
   */
  taskCheckbox: {
    accentColor: primaryColor.solid1,
    blockSize: TASK_CHECKBOX_SIZE,
    flexShrink: 0,
    fontSize: "inherit",
    inlineSize: TASK_CHECKBOX_SIZE,
    lineHeight: "inherit",
    marginTop: stylex.firstThatWorks(
      `calc((1lh - ${TASK_CHECKBOX_SIZE}) / 2)`,
      `calc((${READING_LINE_HEIGHT}em - ${TASK_CHECKBOX_SIZE}) / 2)`,
    ),
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
    paddingInlineEnd: spacing["4"],
    paddingInlineStart: spacing["4"],
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    paddingBottom: spacing["3"],
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
    fontSize: {
      default: READING_SIZE_SMALL,
      "@media (min-width: 40rem)": READING_SIZE_SMALL_WIDE,
    },
  },
  bodyFontSizeLarge: {
    fontSize: {
      default: READING_SIZE_LARGE,
      "@media (min-width: 40rem)": READING_SIZE_LARGE_WIDE,
    },
  },
  /**
   * An explicit reading-font override, so it names the family outright rather
   * than going through `fontFamily.sans`: that token follows the appearance
   * interface font, which would collapse this option into the default one for
   * anyone who picked a font of their own.
   */
  bodyFontSans: {
    fontFamily: READING_SANS_STACK,
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
