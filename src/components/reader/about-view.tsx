"use client";

import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AppWindow,
  ArrowRight,
  Bookmark,
  Check,
  Flame,
  Globe,
  Headphones,
  Heart,
  Info,
  Mail,
  Rss,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";

import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import type { PublicationCard } from "#/integrations/tanstack-query/api-shapes";
import { CHROME_STORE_URL, FIREFOX_STORE_URL } from "#/lib/extension-links";
import { usePageReader } from "#/lib/page-reader/page-reader-context";

import { animationDuration } from "../../design-system/theme/animations.stylex";
import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  gap,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { shadow } from "../../design-system/theme/shadow.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../../design-system/theme/typography.stylex";
import { PubCard } from "./cards";
import { publicationLinkParams } from "./format";
import { Kicker, PublicationAvatar } from "./primitives";

/** Grid-collapse breakpoint (two-up layouts stack below this). */
const TABLET = "@media (max-width: 57.5rem)";
/** Small-phone breakpoint (hero type + inner spacing). */
const MOBILE = "@media (max-width: 40rem)";

// Fixed locale so SSR and client render the same grouped number.
function groupCount(n: number): string {
  return n.toLocaleString("en-US");
}

const RSS_FEEDS = [
  "A single publication",
  "Everything by one author",
  "A topic or tag",
  "One of your saved lists",
  "The latest across everyone you subscribe to",
] as const;

/** Exactly the prose shown in the mock reading card, for the Listen button. */
const READING_EXAMPLE =
  "There is a particular pleasure in reading something that was made to be read, and not to be measured. It asks nothing of you but your attention. The page gets quiet, and the sentence gets loud. So we built the reader we wanted: a column you can size, a font you can choose, and a margin wide enough to think in.";

const INLINE_FEATS = [
  { icon: Sparkles, label: "Recommendations from real reading patterns" },
  { icon: Flame, label: "Trending this week" },
  { icon: Users, label: "Subscribed to by people you follow" },
  { icon: Search, label: "Fast full-text search" },
] as const;

/* ── styles ─────────────────────────────────────────────────────────────── */

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "1040px",
    paddingBottom: spacing["24"],
    paddingLeft: {
      default: spacing["10"],
      [MOBILE]: spacing["5"],
    },
    paddingRight: {
      default: spacing["10"],
      [MOBILE]: spacing["5"],
    },
    paddingTop: {
      default: spacing["16"],
      [MOBILE]: spacing["10"],
    },
    width: "100%",
  },

  /* section scaffolding */
  section: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingBottom: { default: spacing["16"], [TABLET]: spacing["12"] },
    paddingTop: { default: spacing["16"], [TABLET]: spacing["12"] },
  },
  sHead: {
    marginBottom: verticalSpace["8xl"],
    maxWidth: "640px",
  },
  sHeadKicker: {
    display: "inline-block",
    marginBottom: verticalSpace["3xl"],
  },
  h2: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "clamp(1.875rem, 3.4vw, 2.75rem)",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: 1.08,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    textWrap: "balance",
  },
  h2Panel: {
    marginBottom: verticalSpace["4xl"],
  },
  dek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace["3xl"],
    maxWidth: "54ch",
    textWrap: "pretty",
  },

  /* buttons */
  ctaRow: {
    alignItems: "center",
    columnGap: gap.xl,
    display: "flex",
    flexWrap: "wrap",
    rowGap: gap.xl,
  },
  btn: {
    alignItems: "center",
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    columnGap: gap.md,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    paddingBottom: spacing["3"],
    paddingLeft: spacing["5"],
    paddingRight: spacing["5"],
    paddingTop: spacing["3"],
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  btnPrimary: {
    backgroundColor: {
      default: primaryColor.solid1,
      ":hover": primaryColor.solid2,
    },
    borderColor: {
      default: primaryColor.solid1,
      ":hover": primaryColor.solid2,
    },
    color: uiColor.textContrast,
  },
  btnInk: {
    backgroundColor: { default: uiColor.solid1, ":hover": primaryColor.solid1 },
    borderColor: { default: uiColor.solid1, ":hover": primaryColor.solid1 },
    color: uiColor.bg,
  },
  btnGhost: {
    backgroundColor: uiColor.bg,
    borderColor: { default: uiColor.border2, ":hover": primaryColor.border3 },
    color: { default: uiColor.text2, ":hover": primaryColor.text2 },
  },
  inlineLink: {
    color: { default: primaryColor.text2, ":hover": primaryColor.text1 },
    textDecorationColor: primaryColor.border3,
    textDecorationLine: "underline",
    textDecorationThickness: "1px",
    textUnderlineOffset: "0.15em",
  },
  tlink: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
    color: primaryColor.text2,
    columnGap: gap.sm,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginTop: verticalSpace["3xl"],
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    textDecoration: "none",
    width: "fit-content",
  },

  /* hero */
  hero: {
    paddingBottom: spacing["6"],
    paddingTop: spacing["5"],
    textAlign: "center",
  },
  eyebrow: {
    color: primaryColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.72rem",
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "clamp(2.5rem, 6vw, 4.6rem)",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: 1.02,
    marginBottom: verticalSpace.none,
    marginLeft: "auto",
    marginRight: "auto",
    marginTop: verticalSpace["4xl"],
    maxWidth: "15ch",
    textWrap: "balance",
  },
  lede: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: "clamp(1.125rem, 2vw, 1.3125rem)",
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.none,
    marginLeft: "auto",
    marginRight: "auto",
    marginTop: verticalSpace["5xl"],
    maxWidth: "58ch",
    textWrap: "pretty",
  },
  heroCtaRow: {
    justifyContent: "center",
    marginTop: spacing["7"],
  },
  count: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    marginTop: spacing["6"],
  },
  countNum: {
    color: primaryColor.text2,
    fontWeight: fontWeight.semibold,
  },
  shelfLink: {
    borderRadius: radius.lg,
    display: "inline-flex",
    opacity: { default: 1, ":hover": 0.82 },
    textDecoration: "none",
    transitionDuration: animationDuration.fast,
    transitionProperty: "opacity",
  },
  shelf: {
    columnGap: spacing["2.5"],
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    marginLeft: "auto",
    marginRight: "auto",
    marginTop: spacing["11"],
    maxWidth: "760px",
    // eslint-disable-next-line @stylexjs/valid-styles
    maskImage: "linear-gradient(to bottom, #000 82%, transparent)",
    rowGap: spacing["2.5"],
    // eslint-disable-next-line @stylexjs/valid-styles
    WebkitMaskImage: "linear-gradient(to bottom, #000 82%, transparent)",
  },

  /* split standout */
  split: {
    alignItems: "center",
    columnGap: spacing["14"],
    display: "grid",
    gridTemplateColumns: { default: "1fr 1fr", [TABLET]: "1fr" },
    rowGap: spacing["9"],
  },
  splitText: {},
  kickerBlock: {
    display: "inline-block",
    marginBottom: verticalSpace["3xl"],
  },
  splitTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "clamp(1.75rem, 3.2vw, 2.625rem)",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: 1.08,
    marginBottom: verticalSpace["4xl"],
    marginTop: verticalSpace.none,
    textWrap: "balance",
  },
  splitPara: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: 1.62,
    marginBottom: verticalSpace["3xl"],
    marginTop: verticalSpace.none,
    textWrap: "pretty",
  },
  splitParaLast: {
    marginBottom: verticalSpace.none,
  },

  /* mock reading surface */
  read: {
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: shadow.lg,
    paddingBottom: spacing["8"],
    paddingLeft: spacing["8"],
    paddingRight: spacing["8"],
    paddingTop: spacing["8"],
    position: "relative",
  },
  readByline: {
    alignItems: "center",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    columnGap: spacing["2.5"],
    display: "flex",
    marginBottom: spacing["4"],
    paddingBottom: spacing["4"],
  },
  readName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  readHandle: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
  },
  readTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: 1.14,
    marginBottom: spacing["4"],
    marginTop: verticalSpace.none,
  },
  readBody: {
    color: uiColor.text2,
    display: "flow-root",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    lineHeight: 1.66,
  },
  readPara: {
    marginBottom: spacing["3"],
    marginTop: verticalSpace.none,
  },
  dropCap: {
    color: primaryColor.text2,
    float: "left",
    fontFamily: fontFamily.serif,
    fontSize: "3em",
    fontWeight: fontWeight.semibold,
    lineHeight: 0.78,
    paddingRight: spacing["2.5"],
    paddingTop: spacing["1"],
  },
  readPull: {
    borderLeftColor: primaryColor.solid1,
    borderLeftStyle: "solid",
    borderLeftWidth: 3,
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    lineHeight: 1.34,
    marginBottom: spacing["4"],
    marginTop: spacing["4"],
    paddingLeft: spacing["4"],
  },
  readListen: {
    alignItems: "center",
    backgroundColor: { default: uiColor.solid1, ":hover": primaryColor.solid1 },
    borderRadius: radius.full,
    borderStyle: "none",
    borderWidth: 0,
    bottom: spacing["5"],
    color: uiColor.bg,
    columnGap: gap.sm,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    paddingBottom: spacing["2"],
    paddingLeft: spacing["3.5"],
    paddingRight: spacing["3.5"],
    paddingTop: spacing["2"],
    position: "absolute",
    right: spacing["5"],
  },

  /* mini feature triplet */
  miniGrid: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    columnGap: spacing["8"],
    display: "grid",
    gridTemplateColumns: { default: "repeat(3, 1fr)", [TABLET]: "1fr" },
    marginTop: spacing["11"],
    paddingTop: spacing["10"],
    rowGap: spacing["7"],
  },
  iconChip: {
    alignItems: "center",
    backgroundColor: primaryColor.component2,
    borderRadius: radius.md,
    color: primaryColor.text2,
    display: "grid",
    flexShrink: 0,
    height: spacing["10"],
    justifyItems: "center",
    marginBottom: spacing["3.5"],
    width: spacing["10"],
  },
  miniTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.tight,
    marginBottom: spacing["1.5"],
    marginTop: verticalSpace.none,
  },
  miniDesc: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    lineHeight: 1.58,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    textWrap: "pretty",
  },

  /* discover */
  pubPreview: {
    columnGap: spacing["4"],
    display: "grid",
    gridTemplateColumns: { default: "repeat(3, 1fr)", [TABLET]: "1fr" },
    marginTop: spacing["2"],
    rowGap: spacing["4"],
  },
  inlineFeats: {
    columnGap: spacing["6"],
    display: "flex",
    flexWrap: "wrap",
    marginBottom: spacing["1"],
    marginTop: spacing["7"],
    rowGap: spacing["2.5"],
  },
  inlineFeat: {
    alignItems: "center",
    color: uiColor.text1,
    columnGap: gap.md,
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  inlineFeatIcon: {
    color: primaryColor.text2,
    flexShrink: 0,
  },
  storeLinks: {
    columnGap: spacing["6"],
    display: "flex",
    flexWrap: "wrap",
    marginTop: verticalSpace["3xl"],
    rowGap: spacing["2"],
  },
  storeLink: {
    marginTop: verticalSpace.none,
  },
  discoverCta: {
    marginTop: spacing["7"],
  },

  /* panels (rss + digest) */
  panel: {
    backgroundColor: uiColor.bgSubtle,
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    paddingBottom: { default: spacing["11"], [MOBILE]: spacing["7"] },
    paddingLeft: { default: spacing["11"], [MOBILE]: spacing["7"] },
    paddingRight: { default: spacing["11"], [MOBILE]: spacing["7"] },
    paddingTop: { default: spacing["11"], [MOBILE]: spacing["7"] },
  },
  panelSplit: {
    alignItems: "center",
    columnGap: spacing["12"],
    display: "grid",
    gridTemplateColumns: { default: "1fr 1fr", [TABLET]: "1fr" },
    rowGap: spacing["9"],
  },
  panelPara: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: 1.62,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    textWrap: "pretty",
  },
  panelParaSpaced: {
    marginBottom: spacing["6"],
  },

  /* rss feed list */
  feeds: {
    display: "flex",
    flexDirection: "column",
  },
  feed: {
    alignItems: "center",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    columnGap: spacing["3.5"],
    display: "flex",
    paddingBottom: spacing["3.5"],
    paddingTop: spacing["3.5"],
  },
  feedLast: {
    borderBottomWidth: 0,
  },
  feedIcon: {
    color: primaryColor.text2,
    flexShrink: 0,
  },
  feedWhat: {
    color: uiColor.text2,
    flexGrow: 1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    minWidth: 0,
  },
  feedTag: {
    borderColor: uiColor.border2,
    borderRadius: radius.xs,
    borderStyle: "solid",
    borderWidth: 1,
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    paddingBottom: spacing["0.5"],
    paddingLeft: spacing["2"],
    paddingRight: spacing["2"],
    paddingTop: spacing["0.5"],
  },

  /* digest mock email */
  mail: {
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: shadow.lg,
    overflow: "hidden",
  },
  mailBar: {
    alignItems: "center",
    backgroundColor: uiColor.component1,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    columnGap: spacing["2.5"],
    display: "flex",
    paddingBottom: spacing["3"],
    paddingLeft: spacing["4"],
    paddingRight: spacing["4"],
    paddingTop: spacing["3"],
  },
  mailBarIcon: {
    color: primaryColor.text2,
    flexShrink: 0,
  },
  mailFrom: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  mailWhen: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    marginLeft: "auto",
  },
  mailBody: {
    paddingBottom: spacing["6"],
    paddingLeft: spacing["6"],
    paddingRight: spacing["6"],
    paddingTop: spacing["5"],
  },
  mailKicker: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.66rem",
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.widest,
    marginBottom: spacing["1.5"],
    textTransform: "uppercase",
  },
  mailTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
    marginBottom: spacing["5"],
    marginTop: verticalSpace.none,
  },
  mailItem: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingBottom: spacing["3"],
    paddingTop: spacing["3"],
  },
  mailSrc: {
    color: primaryColor.text2,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
  mailSrcMuted: {
    color: uiColor.text1,
  },
  mailHl: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    lineHeight: 1.3,
    marginTop: spacing["0.5"],
  },
  mailFoot: {
    alignItems: "center",
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    color: uiColor.text1,
    columnGap: gap.md,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    marginTop: spacing["1.5"],
    paddingTop: spacing["3.5"],
  },

  /* integrations */
  intGrid: {
    columnGap: spacing["4"],
    display: "grid",
    gridTemplateColumns: { default: "1fr 1fr", [TABLET]: "1fr" },
    rowGap: spacing["4"],
  },
  intCard: {
    backgroundColor: uiColor.bg,
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    paddingBottom: spacing["7"],
    paddingLeft: spacing["7"],
    paddingRight: spacing["7"],
    paddingTop: spacing["7"],
  },
  intFeature: {
    alignItems: { default: "center", [TABLET]: "flex-start" },
    backgroundColor: uiColor.bgSubtle,
    columnGap: spacing["8"],
    flexDirection: { default: "row", [TABLET]: "column" },
    gridColumnEnd: "-1",
    gridColumnStart: "1",
    rowGap: spacing["5"],
  },
  intFigure: {
    alignItems: "center",
    alignSelf: { default: "stretch", [TABLET]: "auto" },
    borderRightColor: { default: uiColor.border1, [TABLET]: "transparent" },
    borderRightStyle: "solid",
    borderRightWidth: { default: 1, [TABLET]: 0 },
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    paddingRight: { default: spacing["8"], [TABLET]: 0 },
    width: { default: "180px", [TABLET]: "auto" },
  },
  intFigureChip: {
    alignItems: "center",
    backgroundColor: primaryColor.component2,
    borderRadius: radius.lg,
    color: primaryColor.text2,
    display: "grid",
    height: spacing["16"],
    justifyItems: "center",
    width: spacing["16"],
  },
  intBody: {
    minWidth: 0,
  },
  intTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.tight,
    marginBottom: spacing["2"],
    marginTop: verticalSpace.none,
  },
  intDesc: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    lineHeight: 1.58,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    textWrap: "pretty",
  },
  builder: {
    alignItems: "center",
    borderColor: uiColor.border2,
    borderRadius: radius.md,
    borderStyle: "dashed",
    borderWidth: 1,
    columnGap: spacing["3.5"],
    display: "flex",
    flexWrap: "wrap",
    marginTop: spacing["6"],
    paddingBottom: spacing["4"],
    paddingLeft: spacing["5"],
    paddingRight: spacing["5"],
    paddingTop: spacing["4"],
    rowGap: spacing["2"],
  },
  builderIcon: {
    color: uiColor.text1,
    flexShrink: 0,
  },
  builderText: {
    color: uiColor.text1,
    flexGrow: 1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    minWidth: "220px",
  },
  builderLink: {
    marginTop: verticalSpace.none,
  },

  /* tenets */
  /* closing */
  close: {
    paddingTop: spacing["16"],
    textAlign: "center",
  },
  closeTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "clamp(1.75rem, 3.4vw, 2.5rem)",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: 1.08,
    marginBottom: verticalSpace.none,
    marginLeft: "auto",
    marginRight: "auto",
    marginTop: verticalSpace.none,
    maxWidth: "16ch",
    textWrap: "balance",
  },
  closeDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    marginBottom: verticalSpace.none,
    marginLeft: "auto",
    marginRight: "auto",
    marginTop: verticalSpace["5xl"],
    maxWidth: "52ch",
    textWrap: "pretty",
  },
});

/* ── small building blocks ──────────────────────────────────────────────── */

type IconType = typeof ArrowRight;

/** A CTA styled as a filled/ink/ghost button. Internal `to`, else external `href`. */
function CtaButton({
  to,
  href,
  variant,
  icon: LeadingIcon,
  trailingArrow = false,
  children,
}: {
  to?: string;
  href?: string;
  variant: "primary" | "ink" | "ghost";
  icon?: IconType;
  trailingArrow?: boolean;
  children: React.ReactNode;
}) {
  const variantStyle =
    variant === "primary"
      ? styles.btnPrimary
      : variant === "ink"
        ? styles.btnInk
        : styles.btnGhost;
  const inner = (
    <>
      {LeadingIcon ? (
        <LeadingIcon size={16} strokeWidth={2.2} aria-hidden />
      ) : null}
      {children}
      {trailingArrow ? <ArrowRight size={16} aria-hidden /> : null}
    </>
  );
  if (to) {
    return (
      <Link to={to} {...stylex.props(styles.btn, variantStyle)}>
        {inner}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...stylex.props(styles.btn, variantStyle)}
    >
      {inner}
    </a>
  );
}

/** Inline "text link with arrow" used inside cards. */
function TextLink({
  to,
  children,
  style,
}: {
  to: string;
  children: React.ReactNode;
  style?: stylex.StyleXStyles;
}) {
  return (
    <Link to={to} {...stylex.props(styles.tlink, style)}>
      {children} <ArrowRight size={15} aria-hidden />
    </Link>
  );
}

/** A hero-shelf publication avatar that links to its page (falls back to a
 * plain avatar when the publication has no resolvable route). */
function ShelfAvatar({ pub }: { pub: PublicationCard }) {
  const params = publicationLinkParams(pub.uri);
  if (!params) {
    return <PublicationAvatar pub={pub} size="lg" />;
  }
  return (
    <Link
      to="/p/$did/$rkey"
      params={params}
      aria-label={`Open ${pub.name}`}
      {...stylex.props(styles.shelfLink)}
    >
      <PublicationAvatar pub={pub} size="lg" />
    </Link>
  );
}

/** External text link (opens in a new tab) styled like {@link TextLink}. */
function ExtLink({
  href,
  children,
  style,
}: {
  href: string;
  children: React.ReactNode;
  style?: stylex.StyleXStyles;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...stylex.props(styles.tlink, style)}
    >
      {children} <ArrowRight size={15} aria-hidden />
    </a>
  );
}

/** URI the sample uses to claim the global player while it reads. */
const SAMPLE_URI = "about:reading-example";

/**
 * The mock card's Listen chip. It reads the example aloud through the app's own
 * reader — the same on-device voices, surfaced in the global player bar — so it
 * demonstrates the real feature rather than the browser's default speech.
 */
function ListenChip({
  text,
  publicationName,
}: {
  text: string;
  publicationName: string | null;
}) {
  const { state, nowPlaying, playSample, stop } = usePageReader();
  const isThis = nowPlaying?.uri === SAMPLE_URI;
  const loading =
    isThis &&
    (state.status === "loading-model" || state.status === "generating");
  const active = isThis && state.status !== "idle" && state.status !== "error";

  const onClick = () => {
    if (active) {
      stop();
      return;
    }
    playSample({
      uri: SAMPLE_URI,
      title: "The Slow Web, Revisited",
      publicationName,
      text,
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        active
          ? "Stop reading this example aloud"
          : "Listen to this example read aloud"
      }
      {...stylex.props(styles.readListen)}
    >
      <Headphones size={15} aria-hidden />{" "}
      {loading ? "Loading…" : active ? "Stop" : "Listen"}
    </button>
  );
}

function SectionHead({
  kicker,
  title,
  dek,
}: {
  kicker: string;
  title: string;
  dek?: string;
}) {
  return (
    <div {...stylex.props(styles.sHead)}>
      <div {...stylex.props(styles.sHeadKicker)}>
        <Kicker>{kicker}</Kicker>
      </div>
      <h2 {...stylex.props(styles.h2)}>{title}</h2>
      {dek ? <p {...stylex.props(styles.dek)}>{dek}</p> : null}
    </div>
  );
}

function MiniFeature({
  icon: Icon,
  title,
  children,
}: {
  icon: IconType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span {...stylex.props(styles.iconChip)}>
        <Icon size={20} aria-hidden />
      </span>
      <h4 {...stylex.props(styles.miniTitle)}>{title}</h4>
      <p {...stylex.props(styles.miniDesc)}>{children}</p>
    </div>
  );
}

function IntegrationCard({
  icon: Icon,
  title,
  children,
  link,
}: {
  icon: IconType;
  title: string;
  children: React.ReactNode;
  link?: { to: string; label: string };
}) {
  return (
    <div {...stylex.props(styles.intCard)}>
      <span {...stylex.props(styles.iconChip)}>
        <Icon size={20} aria-hidden />
      </span>
      <div {...stylex.props(styles.intBody)}>
        <h4 {...stylex.props(styles.intTitle)}>{title}</h4>
        <p {...stylex.props(styles.intDesc)}>{children}</p>
        {link ? <TextLink to={link.to}>{link.label}</TextLink> : null}
      </div>
    </div>
  );
}

/* ── view ───────────────────────────────────────────────────────────────── */

export function AboutView() {
  const { data: knownPublicationCount } = useSuspenseQuery(
    discoverApi.getKnownPublicationCountQueryOptions(),
  );
  const { data: directory } = useSuspenseQuery(
    discoverApi.getPublicationsQueryOptions({ limit: 24 }),
  );
  const { data: trending } = useSuspenseQuery(
    discoverApi.getTrendingPublicationsQueryOptions({ limit: 12 }),
  );

  const pubs: Array<PublicationCard> = directory.items;
  const countLabel =
    knownPublicationCount > 0 ? groupCount(knownPublicationCount) : null;
  const shelf = pubs.slice(0, 24);
  // Preview the pieces that are actually rising this week; fall back to the
  // popular directory when trending is empty (e.g. a cold index).
  const previewPubs = (trending.length > 0 ? trending : pubs).slice(0, 3);
  const firstPub = pubs[0];
  const secondPub = pubs[1];

  return (
    <article {...stylex.props(styles.root)} data-screen-label="About">
      {/* ── Hero ── */}
      <header {...stylex.props(styles.hero)}>
        <span {...stylex.props(styles.eyebrow)}>Standard Reader</span>
        <h1 {...stylex.props(styles.heroTitle)}>
          A home for the writing you love
        </h1>
        <p {...stylex.props(styles.lede)}>
          Subscribe to the publications on{" "}
          <a
            href="https://standard.site"
            target="_blank"
            rel="noopener noreferrer"
            {...stylex.props(styles.inlineLink)}
          >
            standard.site
          </a>{" "}
          you care about. New writing simply arrives, in the order it was
          written — no feed to fight, nothing shouting for your attention. Just
          good long-form, and a genuinely nice way to keep finding more of it.
        </p>
        <div {...stylex.props(styles.ctaRow, styles.heroCtaRow)}>
          <CtaButton to="/login" variant="ghost">
            Sign in
          </CtaButton>
          <CtaButton to="/discover" variant="primary" trailingArrow>
            Start exploring
          </CtaButton>
        </div>
        {countLabel ? (
          <div {...stylex.props(styles.count)}>
            <span {...stylex.props(styles.countNum)}>{countLabel}</span>{" "}
            publications indexed — and counting
          </div>
        ) : null}

        {shelf.length > 0 ? (
          <div {...stylex.props(styles.shelf)}>
            {shelf.map((p) => (
              <ShelfAvatar key={p.uri} pub={p} />
            ))}
          </div>
        ) : null}
      </header>

      {/* ── Calm reading ── */}
      <section {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.split)}>
          <div {...stylex.props(styles.splitText)}>
            <div {...stylex.props(styles.kickerBlock)}>
              <Kicker>The reading experience</Kicker>
            </div>
            <h2 {...stylex.props(styles.splitTitle)}>A quiet place to read</h2>
            <p {...stylex.props(styles.splitPara)}>
              What you get is a reading view made for long-form: a centered
              column, drop caps and pull quotes, full-bleed images you can open
              into a gallery. The page gets out of the way so the writing can do
              its work.
            </p>
            <p {...stylex.props(styles.splitPara, styles.splitParaLast)}>
              And it never feels sealed off. We connect each article to the
              conversation happening across the Atmosphere — the open network
              beyond this app — gathering the Bluesky posts and replies about a
              piece, the notes left in its margins, and the other writing that
              cites it, quietly beneath what you&rsquo;re reading.
            </p>
          </div>

          {/* honest mock of the reading surface — the Listen chip really speaks */}
          <div {...stylex.props(styles.read)}>
            <div {...stylex.props(styles.readByline)} aria-hidden>
              {firstPub ? <PublicationAvatar pub={firstPub} size="sm" /> : null}
              <span {...stylex.props(styles.readName)}>
                {firstPub?.name ?? "The Almanac"}
              </span>
              {firstPub?.ownerHandle ? (
                <span {...stylex.props(styles.readHandle)}>
                  @{firstPub.ownerHandle}
                </span>
              ) : null}
            </div>
            <h3 {...stylex.props(styles.readTitle)} aria-hidden>
              The Slow Web, Revisited
            </h3>
            <div {...stylex.props(styles.readBody)} aria-hidden>
              <p {...stylex.props(styles.readPara)}>
                <span {...stylex.props(styles.dropCap)}>T</span>here is a
                particular pleasure in reading something that was made to be
                read, and not to be measured. It asks nothing of you but your
                attention.
              </p>
              <p {...stylex.props(styles.readPull)}>
                “The page gets quiet, and the sentence gets loud.”
              </p>
              <p {...stylex.props(styles.readPara)}>
                So we built the reader we wanted: a column you can size, a font
                you can choose, and a margin wide enough to think in.
              </p>
            </div>
            <ListenChip
              text={READING_EXAMPLE}
              publicationName={firstPub?.name ?? null}
            />
          </div>
        </div>

        <div {...stylex.props(styles.miniGrid)}>
          <MiniFeature icon={SlidersHorizontal} title="Set your own type">
            Choose body text size, column width, and font — serif, sans, or any
            Google Font. Read the way that’s easy on your eyes.
          </MiniFeature>
          <MiniFeature icon={Headphones} title="Listen to anything">
            A Listen button reads any article aloud, right on your device, and
            highlights each word as it goes. The player follows you around the
            app — it’ll even read an embedded Bluesky post. Signed in, you can
            pick a voice.
          </MiniFeature>
          <MiniFeature icon={Globe} title="Prefer the original?">
            Flip one setting and article links open on the publication’s own
            site instead. Read wherever feels right to you.
          </MiniFeature>
        </div>
      </section>

      {/* ── Discover ── */}
      <section {...stylex.props(styles.section)}>
        <SectionHead
          kicker="Discovery"
          title="Find the ones you didn't know you wanted"
          dek={`Most readers stop at what you already subscribe to. Standard Reader treats finding your next favourite as part of the job. Browse${
            countLabel ? ` all ${countLabel}` : " every"
          } publications on the network — not just the handful you've heard of.`}
        />

        {previewPubs.length > 0 ? (
          <div {...stylex.props(styles.pubPreview)}>
            {previewPubs.map((p) => (
              <PubCard key={p.uri} pub={p} clampDescription />
            ))}
          </div>
        ) : null}

        <div {...stylex.props(styles.inlineFeats)}>
          {INLINE_FEATS.map(({ icon: Icon, label }) => (
            <span key={label} {...stylex.props(styles.inlineFeat)}>
              <Icon
                size={17}
                aria-hidden
                {...stylex.props(styles.inlineFeatIcon)}
              />
              {label}
            </span>
          ))}
        </div>

        <div {...stylex.props(styles.discoverCta)}>
          <CtaButton to="/discover" variant="ink" trailingArrow>
            Browse publications
          </CtaButton>
        </div>
      </section>

      {/* ── Integrations ── */}
      <section {...stylex.props(styles.section)}>
        <SectionHead
          kicker="Integrations"
          title="Standard Reader meets you where you read"
          dek="It doesn't ask you to leave the rest of the web behind. It reaches out to it — and stays a good citizen of the wider network."
        />

        <div {...stylex.props(styles.intGrid)}>
          {/* featured: browser extension */}
          <div {...stylex.props(styles.intCard, styles.intFeature)}>
            <div {...stylex.props(styles.intFigure)}>
              <span {...stylex.props(styles.intFigureChip)}>
                <AppWindow size={30} aria-hidden />
              </span>
            </div>
            <div {...stylex.props(styles.intBody)}>
              <h4 {...stylex.props(styles.intTitle)}>
                Save from anywhere you browse
              </h4>
              <p {...stylex.props(styles.intDesc)}>
                A lightweight browser extension lets you save and subscribe to
                publications while you’re out on the web — with subtle badges on
                bsky.app and a one-click overlay on any page you land on. Your
                reading list fills itself.
              </p>
              <div {...stylex.props(styles.storeLinks)}>
                <ExtLink href={CHROME_STORE_URL} style={styles.storeLink}>
                  Add to Chrome
                </ExtLink>
                <ExtLink href={FIREFOX_STORE_URL} style={styles.storeLink}>
                  Add to Firefox
                </ExtLink>
              </div>
            </div>
          </div>

          <IntegrationCard
            icon={Heart}
            title="Save, like, subscribe — everywhere"
          >
            One tap from the reading view, on any device, instantly in sync.
            Your library is always where you left it.
          </IntegrationCard>

          <IntegrationCard icon={Users} title="The conversation, gathered">
            Under each article you see the discussion from across the open
            network — Bluesky posts and replies, margin notes, links from other
            pieces that cite it, and related reading. All read-only, all linking
            back to the source.
          </IntegrationCard>

          <IntegrationCard icon={Share2} title="Shareable everywhere">
            Publications, lists, and collections each get a clean link with a
            rich preview card — plus a subscribe button a publication can drop
            on its own site.
          </IntegrationCard>

          <IntegrationCard
            icon={Bookmark}
            title="Curated lists & collections"
            link={{ to: "/collections", label: "See collections" }}
          >
            Build named, shareable lists of publications — a playlist for
            reading. Anyone can add your list to their own reader in a single
            tap.
          </IntegrationCard>
        </div>

        <div {...stylex.props(styles.builder)}>
          <Info size={18} aria-hidden {...stylex.props(styles.builderIcon)} />
          <p {...stylex.props(styles.builderText)}>
            Building something on the same index? There’s a public API.
          </p>
          <TextLink to="/docs/api" style={styles.builderLink}>
            Read the API docs
          </TextLink>
        </div>
      </section>

      {/* ── Weekly digest ── */}
      <section {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.panel)}>
          <div {...stylex.props(styles.panelSplit)}>
            {/* mock email */}
            <div {...stylex.props(styles.mail)} aria-hidden>
              <div {...stylex.props(styles.mailBar)}>
                <Mail
                  size={16}
                  aria-hidden
                  {...stylex.props(styles.mailBarIcon)}
                />
                <span {...stylex.props(styles.mailFrom)}>Standard Reader</span>
                <span {...stylex.props(styles.mailWhen)}>Sun · 8:00 AM</span>
              </div>
              <div {...stylex.props(styles.mailBody)}>
                <div {...stylex.props(styles.mailKicker)}>Your week</div>
                <h3 {...stylex.props(styles.mailTitle)}>
                  The best of what you subscribe to
                </h3>
                <div {...stylex.props(styles.mailItem)}>
                  <div {...stylex.props(styles.mailSrc)}>
                    {firstPub?.name ?? "The Almanac"}
                  </div>
                  <div {...stylex.props(styles.mailHl)}>
                    The Slow Web, Revisited
                  </div>
                </div>
                <div {...stylex.props(styles.mailItem)}>
                  <div {...stylex.props(styles.mailSrc)}>
                    {secondPub?.name ?? "Marginalia"}
                  </div>
                  <div {...stylex.props(styles.mailHl)}>
                    On keeping a commonplace book
                  </div>
                </div>
                <div {...stylex.props(styles.mailItem)}>
                  <div {...stylex.props(styles.mailSrc, styles.mailSrcMuted)}>
                    Worth discovering
                  </div>
                  <div {...stylex.props(styles.mailHl)}>
                    {previewPubs[0]?.name ?? "Tidepool"}
                  </div>
                </div>
                <div {...stylex.props(styles.mailFoot)}>
                  <Check size={14} strokeWidth={2.2} aria-hidden /> Unsubscribe
                  in one click, any time
                </div>
              </div>
            </div>

            <div>
              <div {...stylex.props(styles.kickerBlock)}>
                <Kicker>In your inbox</Kicker>
              </div>
              <h2 {...stylex.props(styles.splitTitle, styles.h2Panel)}>
                One tasteful email a week
              </h2>
              <p {...stylex.props(styles.panelPara, styles.panelParaSpaced)}>
                Don’t want another app to check? Opt into a weekly email with
                the best of the publications you subscribe to, plus a couple
                worth discovering. One email, one click to leave — and you can
                preview exactly what it looks like before you ever turn it on.
              </p>
              <CtaButton to="/settings" variant="ghost" icon={Mail}>
                Turn on in Settings
              </CtaButton>
            </div>
          </div>
        </div>
      </section>

      {/* ── RSS ── */}
      <section {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.panel)}>
          <div {...stylex.props(styles.panelSplit)}>
            <div>
              <div {...stylex.props(styles.kickerBlock)}>
                <Kicker>Plays nice with the open web</Kicker>
              </div>
              <h2 {...stylex.props(styles.splitTitle, styles.h2Panel)}>
                Take any of it as RSS
              </h2>
              <p {...stylex.props(styles.panelPara)}>
                Standard Reader doesn’t trap your reading inside one app. Any
                slice of the network comes with its own RSS feed — pipe it
                straight into whatever reader you already use.
              </p>
            </div>
            <div {...stylex.props(styles.feeds)}>
              {RSS_FEEDS.map((what, i) => (
                <div
                  key={what}
                  {...stylex.props(
                    styles.feed,
                    i === RSS_FEEDS.length - 1 && styles.feedLast,
                  )}
                >
                  <Rss
                    size={18}
                    aria-hidden
                    {...stylex.props(styles.feedIcon)}
                  />
                  <span {...stylex.props(styles.feedWhat)}>{what}</span>
                  <span {...stylex.props(styles.feedTag)}>/ rss</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Closing ── */}
      <section {...stylex.props(styles.close)}>
        <h2 {...stylex.props(styles.closeTitle)}>
          Start with a single publication
        </h2>
        <p {...stylex.props(styles.closeDek)}>
          Read without an account. Sign in with Bluesky when you want to
          subscribe, like, and save — and take all of it with you, wherever you
          choose to read next.
        </p>
        <div {...stylex.props(styles.ctaRow, styles.heroCtaRow)}>
          <CtaButton to="/discover" variant="primary" trailingArrow>
            Get started
          </CtaButton>
        </div>
      </section>
    </article>
  );
}
