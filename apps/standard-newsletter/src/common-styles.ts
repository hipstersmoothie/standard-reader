import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

/**
 * The handful of shells every Standard Newsletter screen repeats: the scroll
 * container, the centered measure inside it, the section label, the card, the
 * accent icon tile, and the hairline rules that separate list rows.
 *
 * Screen-specific styling stays local to its route in its own `stylex.create`.
 * This module only holds shapes that appear on three or more screens, so the
 * chrome stays identical across them rather than drifting a pixel at a time.
 *
 * Every value is a design token. Where a design lands between two steps it is
 * snapped to the nearer one; the few genuinely off-scale values left in the app
 * are literals with a comment saying why.
 */
export const common = stylex.create({
  /** Scroll container filling the app shell's content column. */
  screen: {
    backgroundColor: uiColor.bgSubtle,
    height: "100%",
    overflow: "auto",
  },
  /**
   * Centered measure inside {@link common.screen}. Pair with one of the
   * `measure*` widths and a `screenPad*` top inset.
   */
  container: {
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    paddingBottom: spacing["24"],
    paddingInlineEnd: spacing["10"],
    paddingInlineStart: spacing["10"],
    width: "100%",
  },
  /** Top inset for a screen that opens on a back link. */
  screenPadTight: {
    paddingTop: spacing["8"],
  },
  /** Top inset for a screen that opens on its title. */
  screenPadRoomy: {
    paddingTop: spacing["11"],
  },
  // Measures are reading widths, not spacing — they are chosen from the line
  // length the content needs, so they stay literal rather than snapping to a
  // spacing step.
  measureNarrow: { maxWidth: "720px" },
  measureWide: { maxWidth: "940px" },
  measureFull: { maxWidth: "1000px" },

  /** Serif screen title. */
  pageTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["4xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
    marginBlockEnd: 0,
    marginBlockStart: 0,
  },
  /** Serif screen title, one step down — used inside a flow or wizard. */
  pageTitleSm: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
    marginBlockEnd: 0,
    marginBlockStart: 0,
  },
  /** Standfirst under a screen title. */
  pageIntro: {
    color: uiColor.text1,
    fontSize: fontSize.base,
    lineHeight: lineHeight.base,
    marginBlockEnd: 0,
    marginBlockStart: 0,
  },
  /** Uppercase rule label above a section. */
  sectionLabel: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
    letterSpacing: tracking.wider,
    marginBottom: verticalSpace.xl,
    textTransform: "uppercase",
  },
  /** Back link to the parent screen. */
  backLink: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.sm,
    display: "inline-flex",
    fontSize: fontSize.sm,
    rowGap: gap.sm,
    textDecoration: "none",
  },

  /** Raised panel — the design system's `Card` shape, without its padding. */
  card: {
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
  },
  /** Hairline above a list row; the list itself closes with {@link ruleBelow}. */
  ruleAbove: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
  },
  /** Hairline closing a hairline-separated list. */
  ruleBelow: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },

  /**
   * Accent-tinted tile behind an icon. Compose with a `chip*` size; the default
   * corner is the control radius, `chipRound` makes it a circle.
   */
  chip: {
    alignItems: "center",
    backgroundColor: primaryColor.component1,
    borderRadius: radius.md,
    color: primaryColor.text1,
    display: "flex",
    flexGrow: 0,
    flexShrink: 0,
    justifyContent: "center",
  },
  chipSm: { height: spacing["7"], width: spacing["7"] },
  chipMd: { height: spacing["9"], width: spacing["9"] },
  chipLg: { height: spacing["10"], width: spacing["10"] },
  chipXl: { height: spacing["12"], width: spacing["12"] },
  chipRound: { borderRadius: radius.full },
  chipRoomy: { borderRadius: radius.lg },

  /** Icon + label sitting inside a design-system `Button`. */
  buttonContent: {
    alignItems: "center",
    columnGap: gap.md,
    display: "inline-flex",
    rowGap: gap.md,
  },

  /** Muted supporting line — meta, captions, counts. */
  meta: {
    color: uiColor.text1,
    fontSize: fontSize.xs,
  },
  /** Pushes the element to the end of its flex row. */
  pushEnd: {
    marginInlineStart: "auto",
  },
  /** Truncating single line of text. */
  truncate: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /** Flex/grid child that is allowed to shrink below its content width. */
  flexFill: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  /** Flex child pinned at its natural size. */
  flexNone: {
    flexGrow: 0,
    flexShrink: 0,
  },
});
