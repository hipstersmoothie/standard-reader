"use client";

import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { DirectionalIcon } from "@standard-reader/design-system/directional-icon";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  gap,
  verticalSpace,
} from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { shadow } from "@standard-reader/design-system/theme/shadow.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import {
  GUTENBERG_CONTENT,
  LEAFLET_CONTENT,
  LEAFLET_DOCUMENT_FORMAT,
  MARKPUB_FORMATS,
  MOCHOTT_FORMATS,
  OFFPRINT_CONTENT,
  PCKT_CONTENT,
  STRUCTURED_BLOCK_FORMATS,
} from "@standard-reader/renderer-core";
import * as stylex from "@stylexjs/stylex";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AppWindow,
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  Flame,
  Globe,
  Headphones,
  Highlighter,
  Link2,
  Mail,
  MessageSquare,
  PenLine,
  Rss,
  Search,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Users,
} from "lucide-react";

import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import type { PublicationCard } from "#/integrations/tanstack-query/api-shapes";
import { CHROME_STORE_URL, FIREFOX_STORE_URL } from "#/lib/extension-links";
import { usePageReader } from "#/lib/page-reader/page-reader-context";

import { PubCard } from "./cards";
import { publicationLinkParams } from "./format";
import { PlatformMark } from "./platform-logo";
import { PublicationAvatar } from "./primitives";

/** Grid-collapse breakpoint (two-up layouts stack below this). */
const TABLET = "@media (max-width: 57.5rem)";
/** Small-phone breakpoint (hero type + inner spacing). */
const MOBILE = "@media (max-width: 40rem)";

// Fixed locale so SSR and client render the same grouped number.
function groupCount(n: number): string {
  return n.toLocaleString("en-US");
}

const RSS_FEEDS = [
  msg`A single publication`,
  msg`Everything by one author`,
  msg`A topic or tag`,
  msg`One of your saved lists`,
  msg`The latest across everyone you subscribe to`,
] as const;

/** Exactly the prose shown in the mock reading card, for the Listen button. */
const READING_EXAMPLE = msg`There is a particular pleasure in reading something that was made to be read, and not to be measured. It asks nothing of you but your attention. The page gets quiet, and the sentence gets loud. So we built the reader we wanted: a column you can size, a font you can choose, and a margin wide enough to think in.`;

const INLINE_FEATS = [
  { icon: Sparkles, label: msg`Recommendations from real reading patterns` },
  { icon: Flame, label: msg`Trending this week` },
  { icon: Users, label: msg`Subscribed to by people you follow` },
  { icon: Search, label: msg`Fast full-text search` },
] as const;

/**
 * Every content `$type` the shared renderer can turn into a reading view. Derived
 * from the renderer's own parser tables (plus the four block formats it handles
 * ahead of the structured dispatch) so the number on the page cannot drift from
 * what the app actually reads.
 */
const SUPPORTED_CONTENT_FORMATS = new Set([
  ...STRUCTURED_BLOCK_FORMATS,
  LEAFLET_CONTENT,
  LEAFLET_DOCUMENT_FORMAT,
  OFFPRINT_CONTENT,
  PCKT_CONTENT,
]);

/**
 * The three platforms an article can be attributed back to by name — the ones
 * whose marks we ship (see {@link PlatformMark}) and whose articles carry a
 * "read it there instead" affordance.
 */
const NAMED_PLATFORMS = [
  {
    href: "https://leaflet.pub",
    name: "Leaflet",
    platform: "leaflet",
    what: msg`Blocks, pages, and footnotes`,
  },
  {
    href: "https://pckt.blog",
    name: "pckt",
    platform: "pckt",
    what: msg`Short-form posts and long reads`,
  },
  {
    href: "https://offprint.app",
    name: "Offprint",
    platform: "offprint",
    what: msg`Essays and serialized writing`,
  },
] as const;

/**
 * The other tools we call out by name, each with the content `$type`s it owns.
 * The `$type`s are what make the "+ N more" count exact: whatever is listed
 * here is subtracted from {@link SUPPORTED_CONTENT_FORMATS}, so adding or
 * dropping a name here can never leave the remainder wrong.
 *
 * BlockNote's and Afterword's constants are not re-exported from
 * `renderer-core`, so they are spelled out; the rest come from the package.
 */
const OTHER_TOOLS = [
  { formats: MARKPUB_FORMATS, name: "Markpub" },
  { formats: MOCHOTT_FORMATS, name: "Mochott" },
  { formats: ["org.blocknote.document#content"], name: "BlockNote" },
  { formats: ["blog.afterword.content"], name: "Afterword" },
  { formats: [GUTENBERG_CONTENT], name: "SkyPress" },
] as const;

/** Formats accounted for by a named tile or chip above the "+ N more" chip. */
const NAMED_FORMATS = new Set<string>([
  LEAFLET_CONTENT,
  LEAFLET_DOCUMENT_FORMAT,
  OFFPRINT_CONTENT,
  PCKT_CONTENT,
  ...OTHER_TOOLS.flatMap((tool) => tool.formats),
]);

/** Everything the renderer reads that no chip on this page names. */
const UNNAMED_FORMAT_COUNT = [...SUPPORTED_CONTENT_FORMATS].filter(
  (format) => !NAMED_FORMATS.has(format),
).length;

/** The four surfaces the developer docs cover, in sidebar order. */
const DOCS_SURFACES = [
  {
    label: msg`API`,
    to: "/docs/api",
    what: msg`Every feed, directory, and search query the app itself runs.`,
  },
  {
    label: msg`Lexicons`,
    to: "/docs/lexicons",
    what: msg`The record schemas a publication, document, or follow is made of.`,
  },
  {
    label: msg`Renderers`,
    to: "/docs/renderers",
    what: msg`Drop a Standard document into your own app, in your own framework.`,
  },
  {
    label: msg`Labelers`,
    to: "/docs/labelers",
    what: msg`Publish labels others can subscribe to, or consume the ones we do.`,
  },
] as const;

/**
 * Published renderer packages, by the framework each one targets. The shared
 * `@standard-reader/renderer-` prefix lives in the label so the chips stay
 * scannable instead of eight near-identical strings.
 */
const RENDERER_PACKAGES = [
  "core",
  "react",
  "vue",
  "svelte",
  "solid",
  "lit",
  "angular",
  "email",
] as const;

/* ── styles ─────────────────────────────────────────────────────────────── */

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    paddingInlineEnd: {
      [MOBILE]: spacing["5"],
      default: spacing["10"],
    },
    paddingInlineStart: {
      [MOBILE]: spacing["5"],
      default: spacing["10"],
    },
    maxWidth: "65rem",
    paddingBottom: spacing["24"],
    paddingTop: {
      [MOBILE]: spacing["10"],
      default: spacing["16"],
    },
    width: "100%",
  },

  /* section scaffolding */
  section: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingBottom: { [TABLET]: spacing["12"], default: spacing["16"] },
    paddingTop: { [TABLET]: spacing["12"], default: spacing["16"] },
  },
  sHead: {
    marginBottom: verticalSpace["8xl"],
    maxWidth: "40rem",
  },
  h2: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "clamp(1.875rem, 3.4vw, 2.75rem)",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: 1.08,
    textWrap: "balance",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
  },
  /** Panel headings sit a step below the section `h2` so hierarchy survives. */
  h2Panel: {
    fontSize: "clamp(1.5rem, 2.4vw, 1.875rem)",
    marginBottom: verticalSpace["4xl"],
  },
  dek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace["3xl"],
    maxWidth: "54ch",
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
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    textDecoration: "none",
    alignItems: "center",
    columnGap: gap.md,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    paddingInlineEnd: spacing["5"],
    paddingInlineStart: spacing["5"],
    whiteSpace: "nowrap",
    paddingBottom: spacing["3"],
    paddingTop: spacing["3"],
  },
  btnPrimary: {
    borderColor: {
      default: primaryColor.solid1,
      ":hover": primaryColor.solid2,
    },
    backgroundColor: {
      default: primaryColor.solid1,
      ":hover": primaryColor.solid2,
    },
    color: uiColor.textContrast,
  },
  btnInk: {
    borderColor: { default: uiColor.solid1, ":hover": primaryColor.solid1 },
    backgroundColor: { default: uiColor.solid1, ":hover": primaryColor.solid1 },
    color: uiColor.bg,
  },
  btnGhost: {
    borderColor: { default: uiColor.border2, ":hover": primaryColor.border3 },
    backgroundColor: uiColor.bg,
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
    borderWidth: 0,
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: "transparent",
    color: primaryColor.text2,
    columnGap: gap.sm,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    paddingInlineEnd: 0,
    paddingInlineStart: 0,
    marginTop: verticalSpace["3xl"],
    paddingBottom: 0,
    paddingTop: 0,
    width: "fit-content",
  },

  /* hero */
  hero: {
    textAlign: "center",
    paddingBottom: spacing["6"],
    paddingTop: spacing["5"],
  },
  heroTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "clamp(2.5rem, 6vw, 4.6rem)",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: 1.02,
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    textWrap: "balance",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    maxWidth: "15ch",
  },
  lede: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: "clamp(1.125rem, 2vw, 1.3125rem)",
    lineHeight: lineHeight.sm,
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace["5xl"],
    maxWidth: "58ch",
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
    textDecoration: "none",
    display: "inline-flex",
    opacity: { default: 1, ":hover": 0.82 },
    transitionDuration: animationDuration.fast,
    transitionProperty: "opacity",
  },
  shelf: {
    // eslint-disable-next-line @stylexjs/valid-styles
    WebkitMaskImage: "linear-gradient(to bottom, #000 82%, transparent)",
    columnGap: spacing["2.5"],
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    // eslint-disable-next-line @stylexjs/valid-styles
    maskImage: "linear-gradient(to bottom, #000 82%, transparent)",
    rowGap: spacing["2.5"],
    marginTop: spacing["11"],
    maxWidth: "47.5rem",
  },

  /* split standout */
  split: {
    alignItems: "center",
    columnGap: spacing["14"],
    display: "grid",
    gridTemplateColumns: { [TABLET]: "1fr", default: "1fr 1fr" },
    rowGap: spacing["9"],
  },
  splitTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "clamp(1.75rem, 3.2vw, 2.625rem)",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: 1.08,
    textWrap: "balance",
    marginBottom: verticalSpace["4xl"],
    marginTop: verticalSpace.none,
  },
  splitPara: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: 1.62,
    textWrap: "pretty",
    marginBottom: verticalSpace["3xl"],
    marginTop: verticalSpace.none,
  },
  splitParaLast: {
    marginBottom: verticalSpace.none,
  },

  /* mock reading surface */
  read: {
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    backgroundColor: uiColor.bg,
    boxShadow: shadow.lg,
    paddingInlineEnd: spacing["8"],
    paddingInlineStart: spacing["8"],
    position: "relative",
    paddingBottom: spacing["8"],
    paddingTop: spacing["8"],
  },
  readByline: {
    alignItems: "center",
    columnGap: spacing["2.5"],
    display: "flex",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
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
    float: "inline-start",
    fontFamily: fontFamily.serif,
    fontSize: "3em",
    fontWeight: fontWeight.semibold,
    lineHeight: 0.78,
    paddingInlineEnd: spacing["2.5"],
    paddingTop: spacing["1"],
  },
  readPull: {
    borderInlineStartColor: primaryColor.solid1,
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 3,
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    lineHeight: 1.34,
    paddingInlineStart: spacing["4"],
    marginBottom: spacing["4"],
    marginTop: spacing["4"],
  },
  readListen: {
    borderRadius: radius.full,
    borderStyle: "none",
    borderWidth: 0,
    alignItems: "center",
    backgroundColor: { default: uiColor.solid1, ":hover": primaryColor.solid1 },
    color: uiColor.bg,
    columnGap: gap.sm,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    insetInlineEnd: spacing["5"],
    paddingInlineEnd: spacing["3.5"],
    paddingInlineStart: spacing["3.5"],
    position: "absolute",
    bottom: spacing["5"],
    paddingBottom: spacing["2"],
    paddingTop: spacing["2"],
  },

  /* mini feature triplet */
  miniGrid: {
    columnGap: spacing["8"],
    display: "grid",
    gridTemplateColumns: { [TABLET]: "1fr", default: "repeat(3, 1fr)" },
    rowGap: spacing["7"],
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: spacing["11"],
    paddingTop: spacing["10"],
  },
  iconChip: {
    borderRadius: radius.md,
    cornerShape: "squircle",
    alignItems: "center",
    backgroundColor: primaryColor.component2,
    color: primaryColor.text2,
    display: "grid",
    flexShrink: 0,
    justifyItems: "center",
    height: spacing["10"],
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
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
  },

  /* discover */
  pubPreview: {
    columnGap: spacing["4"],
    display: "grid",
    gridTemplateColumns: { [TABLET]: "1fr", default: "repeat(3, 1fr)" },
    rowGap: spacing["4"],
    marginTop: spacing["2"],
  },
  inlineFeats: {
    columnGap: spacing["6"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["2.5"],
    marginBottom: spacing["1"],
    marginTop: spacing["7"],
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
    rowGap: spacing["2"],
    marginTop: verticalSpace["3xl"],
  },
  storeLink: {
    marginTop: verticalSpace.none,
  },
  afterPara: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: 1.62,
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: spacing["8"],
    maxWidth: "58ch",
  },
  discoverCta: {
    marginTop: spacing["7"],
  },

  /* the gathered conversation */
  atmo: {
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    overflow: "hidden",
    backgroundColor: uiColor.bg,
    boxShadow: shadow.lg,
  },
  atmoBar: {
    alignItems: "baseline",
    backgroundColor: uiColor.component1,
    columnGap: gap.md,
    display: "flex",
    flexWrap: "wrap",
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["6"],
    rowGap: spacing["1"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3"],
    paddingTop: spacing["3"],
  },
  atmoBarLabel: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  atmoBarTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
  },
  atmoList: {
    listStyle: "none",
    paddingInlineEnd: 0,
    paddingInlineStart: 0,
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    paddingBottom: 0,
    paddingTop: 0,
  },
  atmoItem: {
    columnGap: spacing["3.5"],
    display: "flex",
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["6"],
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingBottom: spacing["4"],
    paddingTop: spacing["4"],
  },
  atmoItemFirst: {
    borderTopWidth: 0,
  },
  atmoMark: {
    borderRadius: radius.full,
    alignItems: "center",
    backgroundColor: uiColor.component1,
    color: primaryColor.text2,
    display: "grid",
    flexShrink: 0,
    justifyItems: "center",
    height: spacing["8"],
    width: spacing["8"],
  },
  atmoBody: {
    minWidth: 0,
  },
  atmoMeta: {
    alignItems: "baseline",
    columnGap: gap.md,
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["0.5"],
    marginBottom: spacing["1"],
  },
  atmoWho: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  atmoSrc: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
  },
  atmoText: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    lineHeight: 1.6,
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
  },
  atmoQuote: {
    borderRadius: radius.sm,
    cornerShape: "squircle",
    backgroundColor: uiColor.bgSubtle,
    color: uiColor.text1,
    display: "block",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xs,
    fontStyle: "italic",
    lineHeight: 1.5,
    paddingInlineEnd: spacing["2.5"],
    paddingInlineStart: spacing["2.5"],
    marginBottom: spacing["2"],
    paddingBottom: spacing["1.5"],
    paddingTop: spacing["1.5"],
  },

  /* supported formats */
  fmtRow: {
    columnGap: spacing["4"],
    display: "grid",
    gridTemplateColumns: {
      [TABLET]: "1fr",
      default: "repeat(3, 1fr)",
    },
    rowGap: spacing["4"],
  },
  fmtTile: {
    borderColor: { default: uiColor.border1, ":hover": primaryColor.border3 },
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    textDecoration: "none",
    alignItems: "center",
    backgroundColor: { default: uiColor.bg, ":hover": uiColor.bgSubtle },
    columnGap: spacing["4"],
    display: "flex",
    paddingInlineEnd: spacing["5"],
    paddingInlineStart: spacing["5"],
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color, border-color",
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
  },
  fmtName: {
    color: uiColor.text2,
    display: "block",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.tight,
  },
  fmtWhat: {
    color: uiColor.text1,
    display: "block",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    lineHeight: 1.45,
    marginTop: spacing["0.5"],
  },
  fmtMore: {
    alignItems: "baseline",
    columnGap: spacing["2"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["2"],
    marginTop: spacing["8"],
  },
  fmtMoreLabel: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    marginInlineEnd: spacing["1"],
  },
  fmtChip: {
    borderColor: uiColor.border1,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.bgSubtle,
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    paddingInlineEnd: spacing["2.5"],
    paddingInlineStart: spacing["2.5"],
    whiteSpace: "nowrap",
    paddingBottom: spacing["1"],
    paddingTop: spacing["1"],
  },
  fmtChipMore: {
    borderStyle: "dashed",
    backgroundColor: "transparent",
    fontFamily: fontFamily.mono,
  },

  /* panels (rss + digest) */
  panel: {
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    backgroundColor: uiColor.bgSubtle,
    paddingInlineEnd: { [MOBILE]: spacing["7"], default: spacing["11"] },
    paddingInlineStart: { [MOBILE]: spacing["7"], default: spacing["11"] },
    paddingBottom: { [MOBILE]: spacing["7"], default: spacing["11"] },
    paddingTop: { [MOBILE]: spacing["7"], default: spacing["11"] },
  },
  panelStacked: {
    marginTop: spacing["4"],
  },
  panelSplit: {
    alignItems: "center",
    columnGap: spacing["12"],
    display: "grid",
    gridTemplateColumns: { [TABLET]: "1fr", default: "1fr 1fr" },
    rowGap: spacing["9"],
  },
  panelPara: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: 1.62,
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
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
    columnGap: spacing["3.5"],
    display: "flex",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
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
    cornerShape: "squircle",
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    paddingInlineEnd: spacing["2"],
    paddingInlineStart: spacing["2"],
    paddingBottom: spacing["0.5"],
    paddingTop: spacing["0.5"],
  },

  /* digest mock email */
  mail: {
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    overflow: "hidden",
    backgroundColor: uiColor.bg,
    boxShadow: shadow.lg,
  },
  mailBar: {
    alignItems: "center",
    backgroundColor: uiColor.component1,
    columnGap: spacing["2.5"],
    display: "flex",
    paddingInlineEnd: spacing["4"],
    paddingInlineStart: spacing["4"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3"],
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
    marginInlineStart: "auto",
  },
  mailBody: {
    paddingInlineEnd: spacing["6"],
    paddingInlineStart: spacing["6"],
    paddingBottom: spacing["6"],
    paddingTop: spacing["5"],
  },
  mailKicker: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.66rem",
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.widest,
    textTransform: "uppercase",
    marginBottom: spacing["1.5"],
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
    color: uiColor.text1,
    columnGap: gap.md,
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: spacing["1.5"],
    paddingTop: spacing["3.5"],
  },

  /* the featured band (browser extension) */
  band: {
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    alignItems: { [TABLET]: "flex-start", default: "center" },
    backgroundColor: uiColor.bgSubtle,
    columnGap: spacing["8"],
    display: "flex",
    flexDirection: { [TABLET]: "column", default: "row" },
    paddingInlineEnd: spacing["7"],
    paddingInlineStart: spacing["7"],
    rowGap: spacing["5"],
    paddingBottom: spacing["7"],
    paddingTop: spacing["7"],
  },
  bandFigure: {
    alignItems: "center",
    alignSelf: { [TABLET]: "auto", default: "stretch" },
    borderInlineEndColor: { [TABLET]: "transparent", default: uiColor.border1 },
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: { [TABLET]: 0, default: 1 },
    display: "flex",
    flexShrink: 0,
    justifyContent: "center",
    paddingInlineEnd: { [TABLET]: 0, default: spacing["8"] },
    width: { [TABLET]: "auto", default: "11.25rem" },
  },
  bandFigureChip: {
    borderRadius: radius.lg,
    cornerShape: "squircle",
    alignItems: "center",
    backgroundColor: primaryColor.component2,
    color: primaryColor.text2,
    display: "grid",
    justifyItems: "center",
    height: spacing["16"],
    width: spacing["16"],
  },
  bandBody: {
    minWidth: 0,
  },
  bandTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.tight,
    marginBottom: spacing["2"],
    marginTop: verticalSpace.none,
  },
  bandDesc: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    lineHeight: 1.58,
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
  },

  /* closing note under a section */
  note: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    alignItems: "center",
    columnGap: spacing["3.5"],
    display: "flex",
    flexWrap: "wrap",
    paddingInlineEnd: spacing["5"],
    paddingInlineStart: spacing["5"],
    rowGap: spacing["2"],
    marginTop: spacing["6"],
    paddingBottom: spacing["4"],
    paddingTop: spacing["4"],
  },
  noteIcon: {
    color: primaryColor.text2,
    flexShrink: 0,
  },
  noteText: {
    color: uiColor.text1,
    flexGrow: 1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    lineHeight: 1.55,
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    minWidth: "13.75rem",
  },

  /* developer platform */
  code: {
    borderColor: uiColor.border1,
    borderRadius: radius.lg,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    overflow: "hidden",
    backgroundColor: uiColor.bg,
    boxShadow: shadow.lg,
  },
  codeBar: {
    alignItems: "center",
    backgroundColor: uiColor.component1,
    color: uiColor.text1,
    columnGap: spacing["2.5"],
    display: "flex",
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    paddingInlineEnd: spacing["4"],
    paddingInlineStart: spacing["4"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3"],
    paddingTop: spacing["3"],
  },
  codePre: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    lineHeight: 1.7,
    // Long at-uris would otherwise clip off the right edge with no affordance.
    overflowWrap: "anywhere",
    paddingInlineEnd: spacing["5"],
    paddingInlineStart: spacing["5"],
    whiteSpace: "pre-wrap",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
  },
  codeCmd: {
    color: uiColor.text2,
    fontWeight: fontWeight.semibold,
  },
  codeUrl: {
    color: primaryColor.text2,
  },
  codeKey: {
    color: uiColor.text2,
    fontWeight: fontWeight.semibold,
  },
  codeStr: {
    color: primaryColor.text2,
  },
  codeNum: {
    color: uiColor.text2,
  },
  devList: {
    columnGap: spacing["8"],
    display: "grid",
    gridTemplateColumns: { [MOBILE]: "1fr", default: "repeat(2, 1fr)" },
    rowGap: spacing["7"],
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: spacing["11"],
    paddingTop: spacing["9"],
  },
  devItem: {
    minWidth: 0,
  },
  devLink: {
    textDecoration: "none",
    color: { default: uiColor.text2, ":hover": primaryColor.text2 },
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.tight,
    transitionDuration: animationDuration.fast,
    transitionProperty: "color",
  },
  devWhat: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    lineHeight: 1.55,
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: spacing["1.5"],
  },
  pkgRow: {
    alignItems: "baseline",
    columnGap: spacing["2"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["2"],
    marginTop: spacing["9"],
  },
  pkgLabel: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    marginInlineEnd: spacing["1"],
  },
  pkgPrefix: {
    color: uiColor.text2,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
  },
  pkgChip: {
    borderColor: uiColor.border1,
    borderRadius: radius.xs,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    backgroundColor: uiColor.bgSubtle,
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    paddingInlineEnd: spacing["2"],
    paddingInlineStart: spacing["2"],
    whiteSpace: "nowrap",
    paddingBottom: spacing["0.5"],
    paddingTop: spacing["0.5"],
  },

  /* closing */
  close: {
    textAlign: "center",
    paddingTop: spacing["16"],
  },
  closeTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: "clamp(1.75rem, 3.4vw, 2.5rem)",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: 1.08,
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    textWrap: "balance",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace.none,
    maxWidth: "16ch",
  },
  closeDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    textWrap: "pretty",
    marginBottom: verticalSpace.none,
    marginTop: verticalSpace["5xl"],
    maxWidth: "52ch",
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
      {trailingArrow ? <DirectionalIcon as={ArrowRight} size={16} /> : null}
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

/** A hero-shelf publication avatar that links to its page (falls back to a
 * plain avatar when the publication has no resolvable route). */
function ShelfAvatar({ pub }: { pub: PublicationCard }) {
  const { t } = useLingui();
  const params = publicationLinkParams(pub.uri);
  if (!params) {
    return <PublicationAvatar pub={pub} size="lg" />;
  }
  const pubName = pub.name;
  return (
    <Link
      to="/p/$did/$rkey"
      params={params}
      aria-label={t`Open ${pubName}`}
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
      {children} <DirectionalIcon as={ArrowRight} size={15} />
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
  const { t } = useLingui();
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
      title: t`The Slow Web, Revisited`,
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
          ? t`Stop reading this example aloud`
          : t`Listen to this example read aloud`
      }
      {...stylex.props(styles.readListen)}
    >
      <Headphones size={15} aria-hidden />{" "}
      {loading ? t`Loading…` : active ? t`Stop` : t`Listen`}
    </button>
  );
}

function SectionHead({ title, dek }: { title: string; dek?: string }) {
  return (
    <div {...stylex.props(styles.sHead)}>
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

/**
 * One row of the mock "under this article" stack. `who` is illustrative — the
 * whole figure is `aria-hidden`, and the real thing is assembled from records
 * on the network at read time.
 */
function AtmoItem({
  icon: Icon,
  first = false,
  who,
  source,
  quote,
  children,
}: {
  icon: IconType;
  first?: boolean;
  who: string;
  source: string;
  quote?: string;
  children: React.ReactNode;
}) {
  return (
    <li {...stylex.props(styles.atmoItem, first && styles.atmoItemFirst)}>
      <span {...stylex.props(styles.atmoMark)}>
        <Icon size={15} strokeWidth={2} aria-hidden />
      </span>
      <div {...stylex.props(styles.atmoBody)}>
        <div {...stylex.props(styles.atmoMeta)}>
          <span {...stylex.props(styles.atmoWho)}>{who}</span>
          <span {...stylex.props(styles.atmoSrc)}>{source}</span>
        </div>
        {quote ? (
          <span {...stylex.props(styles.atmoQuote)}>{quote}</span>
        ) : null}
        <p {...stylex.props(styles.atmoText)}>{children}</p>
      </div>
    </li>
  );
}

/* ── view ───────────────────────────────────────────────────────────────── */

export function AboutView() {
  const { t, i18n } = useLingui();
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
  const discoverDek = countLabel
    ? t`Most readers stop at what they already subscribe to. Standard Reader treats the next voice as part of the job: the piece you just finished points at who cited it, what it’s related to, and who else is worth following — across all ${countLabel} publications on the network, not just the handful you’ve heard of.`
    : t`Most readers stop at what they already subscribe to. Standard Reader treats the next voice as part of the job: the piece you just finished points at who cited it, what it’s related to, and who else is worth following — across every publication on the network, not just the handful you’ve heard of.`;

  // A real response from the public API, using a publication that is actually
  // trending right now — the snippet is the endpoint anyone can call.
  const samplePub = previewPubs[0] ?? firstPub;

  return (
    <article {...stylex.props(styles.root)} data-screen-label="About">
      {/* ── Hero ── */}
      <header {...stylex.props(styles.hero)}>
        <h1 {...stylex.props(styles.heroTitle)}>
          <Trans>A home for the writing you love</Trans>
        </h1>
        <p {...stylex.props(styles.lede)}>
          <Trans>
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
            written — no feed to fight, nothing shouting for your attention.
            Just good long-form, and a genuinely nice way to keep finding more
            of it.
          </Trans>
        </p>
        <div {...stylex.props(styles.ctaRow, styles.heroCtaRow)}>
          <CtaButton to="/login" variant="ghost">
            <Trans>Sign in</Trans>
          </CtaButton>
          <CtaButton to="/discover" variant="primary" trailingArrow>
            <Trans>Start exploring</Trans>
          </CtaButton>
        </div>
        {countLabel ? (
          <div {...stylex.props(styles.count)}>
            <Trans>
              <span {...stylex.props(styles.countNum)}>{countLabel}</span>{" "}
              publications indexed — and counting
            </Trans>
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

      {/* ── 1. The reading surface ── */}
      <section {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.split)}>
          <div>
            <h2 {...stylex.props(styles.splitTitle)}>
              <Trans>A quiet place to read</Trans>
            </h2>
            <p {...stylex.props(styles.splitPara)}>
              <Trans>
                What you get is a reading view made for long-form: a centered
                column, drop caps and pull quotes, full-bleed images you can
                open into a gallery. The page gets out of the way so the writing
                can do its work.
              </Trans>
            </p>
            <p {...stylex.props(styles.splitPara, styles.splitParaLast)}>
              <Trans>
                Nothing about it is fixed. Set the measure, the type size, and
                the typeface to whatever your eyes want, in light or dark, and
                the setting follows you to every article you open after it.
              </Trans>
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
              <Trans>The Slow Web, Revisited</Trans>
            </h3>
            <div {...stylex.props(styles.readBody)} aria-hidden>
              <p {...stylex.props(styles.readPara)}>
                <Trans>
                  <span {...stylex.props(styles.dropCap)}>T</span>here is a
                  particular pleasure in reading something that was made to be
                  read, and not to be measured. It asks nothing of you but your
                  attention.
                </Trans>
              </p>
              <p {...stylex.props(styles.readPull)}>
                <Trans>
                  “The page gets quiet, and the sentence gets loud.”
                </Trans>
              </p>
              <p {...stylex.props(styles.readPara)}>
                <Trans>
                  So we built the reader we wanted: a column you can size, a
                  font you can choose, and a margin wide enough to think in.
                </Trans>
              </p>
            </div>
            <ListenChip
              text={i18n._(READING_EXAMPLE)}
              publicationName={firstPub?.name ?? null}
            />
          </div>
        </div>

        <div {...stylex.props(styles.miniGrid)}>
          <MiniFeature icon={SlidersHorizontal} title={t`Set your own type`}>
            <Trans>
              Choose body text size, column width, and font — serif, sans, or
              any Google Font. Read the way that’s easy on your eyes.
            </Trans>
          </MiniFeature>
          <MiniFeature icon={Headphones} title={t`Listen to anything`}>
            <Trans>
              A Listen button reads any article aloud, right on your device, and
              highlights each word as it goes. The player follows you around the
              app — it’ll even read an embedded Bluesky post. Signed in, you can
              pick a voice.
            </Trans>
          </MiniFeature>
          <MiniFeature icon={Highlighter} title={t`Keep the good sentence`}>
            <Trans>
              Select a passage and share it as a typeset card that links back to
              the article — or keep reading and pick up exactly where you left
              off next time.
            </Trans>
          </MiniFeature>
        </div>
      </section>

      {/* ── 2. Reading starts a journey ── */}
      <section {...stylex.props(styles.section)}>
        <SectionHead
          title={t`Every piece is a door to the next one`}
          dek={discoverDek}
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
            <span key={label.id} {...stylex.props(styles.inlineFeat)}>
              <Icon
                size={17}
                aria-hidden
                {...stylex.props(styles.inlineFeatIcon)}
              />
              {i18n._(label)}
            </span>
          ))}
        </div>

        <p {...stylex.props(styles.afterPara)}>
          <Trans>
            And when a run of them turns out to be good together, collect them
            into a named list — a playlist for reading. Anyone can add the whole
            thing to their own reader in a single tap.
          </Trans>
        </p>

        <div {...stylex.props(styles.ctaRow, styles.discoverCta)}>
          <CtaButton to="/collections" variant="ghost" icon={BookOpen}>
            <Trans>See collections</Trans>
          </CtaButton>
          <CtaButton to="/discover" variant="ink" trailingArrow>
            <Trans>Browse publications</Trans>
          </CtaButton>
        </div>
      </section>

      {/* ── 3. The social piece blogging never had ── */}
      <section {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.split)}>
          <div>
            <h2 {...stylex.props(styles.splitTitle)}>
              <Trans>The part blogging always missed</Trans>
            </h2>
            <p {...stylex.props(styles.splitPara)}>
              <Trans>
                Blogs never really solved the conversation. Comment boxes
                belonged to the blog, went unread, filled with spam, and
                vanished when the site did. So the talking moved somewhere else
                — and stopped being attached to the writing at all.
              </Trans>
            </p>
            <p {...stylex.props(styles.splitPara, styles.splitParaLast)}>
              <Trans>
                None of this is ours. We gather it from the Atmosphere — the
                open network these apps all share — and show it under the piece
                it’s about. Every line links back to where it was actually
                written, no account or comment box required, and it works
                whether or not the author ever opted in.
              </Trans>
            </p>
          </div>

          <div {...stylex.props(styles.atmo)} aria-hidden>
            <div {...stylex.props(styles.atmoBar)}>
              <span {...stylex.props(styles.atmoBarLabel)}>
                <Trans>Under this article</Trans>
              </span>
              <span {...stylex.props(styles.atmoBarTitle)}>
                <Trans>The Slow Web, Revisited</Trans>
              </span>
            </div>
            <ul {...stylex.props(styles.atmoList)}>
              <AtmoItem
                first
                icon={MessageSquare}
                who={t`A reply`}
                source={t`on Bluesky`}
              >
                <Trans>
                  “Been thinking about this all week. The measurement is the
                  part that ruins it — not the writing.”
                </Trans>
              </AtmoItem>
              <AtmoItem
                icon={PenLine}
                who={t`A note in the margin`}
                source={t`on Margin`}
                quote={t`“…made to be read, and not to be measured.”`}
              >
                <Trans>
                  “This is the whole argument in one clause. Worth sitting
                  with.”
                </Trans>
              </AtmoItem>
              <AtmoItem icon={Link2} who={t`Cited by`} source={t`Semble`}>
                <Trans>
                  Two other pieces link to this one — you can read them from
                  here.
                </Trans>
              </AtmoItem>
              <AtmoItem
                icon={Compass}
                who={t`Related reading`}
                source={t`Semble`}
              >
                <Trans>
                  Four essays covering the same ground, from publications you
                  don’t follow yet.
                </Trans>
              </AtmoItem>
            </ul>
          </div>
        </div>
      </section>

      {/* ── 4. Supported formats ── */}
      <section {...stylex.props(styles.section)}>
        <SectionHead
          title={t`Written wherever they write`}
          dek={t`An article is a record in its author’s own repository, and every publishing tool on the network writes that record a little differently. Standard Reader reads ${SUPPORTED_CONTENT_FORMATS.size} of those content formats and renders them all into the same calm page — so a reader never has to care which tool a writer chose.`}
        />

        <div {...stylex.props(styles.fmtRow)}>
          {NAMED_PLATFORMS.map((p) => (
            <a
              key={p.name}
              href={p.href}
              target="_blank"
              rel="noopener noreferrer"
              {...stylex.props(styles.fmtTile)}
            >
              <PlatformMark platform={p.platform} size={30} />
              <span>
                <span {...stylex.props(styles.fmtName)}>{p.name}</span>
                <span {...stylex.props(styles.fmtWhat)}>{i18n._(p.what)}</span>
              </span>
            </a>
          ))}
        </div>

        <div {...stylex.props(styles.fmtMore)}>
          <span {...stylex.props(styles.fmtMoreLabel)}>
            <Trans>Also read natively:</Trans>
          </span>
          {OTHER_TOOLS.map((tool) => (
            <span key={tool.name} {...stylex.props(styles.fmtChip)}>
              {tool.name}
            </span>
          ))}
          <span {...stylex.props(styles.fmtChip, styles.fmtChipMore)}>
            <Trans>+{UNNAMED_FORMAT_COUNT} more</Trans>
          </span>
        </div>

        <div {...stylex.props(styles.note)}>
          <Globe size={18} aria-hidden {...stylex.props(styles.noteIcon)} />
          <p {...stylex.props(styles.noteText)}>
            <Trans>
              Prefer the original? Flip one setting and article links open on
              the publication’s own site instead — Standard Reader will still
              keep your place.
            </Trans>
          </p>
        </div>
      </section>

      {/* ── 5. However you like to read it ── */}
      <section {...stylex.props(styles.section)}>
        <SectionHead
          title={t`However you like to read it`}
          dek={t`Standard Reader doesn’t ask you to move in. It goes out to the web you already use, and hands your reading back in whatever shape suits you.`}
        />

        <div {...stylex.props(styles.band)}>
          <div {...stylex.props(styles.bandFigure)}>
            <span {...stylex.props(styles.bandFigureChip)}>
              <AppWindow size={30} aria-hidden />
            </span>
          </div>
          <div {...stylex.props(styles.bandBody)}>
            <h3 {...stylex.props(styles.bandTitle)}>
              <Trans>Save from anywhere you browse</Trans>
            </h3>
            <p {...stylex.props(styles.bandDesc)}>
              <Trans>
                A lightweight browser extension lets you save and subscribe to
                publications while you’re out on the web — with subtle badges on
                bsky.app and a one-click overlay on any page you land on. Your
                reading list fills itself, and every save, like, and subscribe
                is instantly in sync with whatever device you read on next.
              </Trans>
            </p>
            <div {...stylex.props(styles.storeLinks)}>
              <ExtLink href={CHROME_STORE_URL} style={styles.storeLink}>
                <Trans>Add to Chrome</Trans>
              </ExtLink>
              <ExtLink href={FIREFOX_STORE_URL} style={styles.storeLink}>
                <Trans>Add to Firefox</Trans>
              </ExtLink>
            </div>
          </div>
        </div>

        <div {...stylex.props(styles.panel, styles.panelStacked)}>
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
                <span {...stylex.props(styles.mailWhen)}>
                  <Trans>Sun · 8:00 AM</Trans>
                </span>
              </div>
              <div {...stylex.props(styles.mailBody)}>
                <div {...stylex.props(styles.mailKicker)}>
                  <Trans>Your week</Trans>
                </div>
                <h3 {...stylex.props(styles.mailTitle)}>
                  <Trans>The best of what you subscribe to</Trans>
                </h3>
                <div {...stylex.props(styles.mailItem)}>
                  <div {...stylex.props(styles.mailSrc)}>
                    {firstPub?.name ?? "The Almanac"}
                  </div>
                  <div {...stylex.props(styles.mailHl)}>
                    <Trans>The Slow Web, Revisited</Trans>
                  </div>
                </div>
                <div {...stylex.props(styles.mailItem)}>
                  <div {...stylex.props(styles.mailSrc)}>
                    {secondPub?.name ?? "Marginalia"}
                  </div>
                  <div {...stylex.props(styles.mailHl)}>
                    <Trans>On keeping a commonplace book</Trans>
                  </div>
                </div>
                <div {...stylex.props(styles.mailItem)}>
                  <div {...stylex.props(styles.mailSrc, styles.mailSrcMuted)}>
                    <Trans>Worth discovering</Trans>
                  </div>
                  <div {...stylex.props(styles.mailHl)}>
                    {previewPubs[0]?.name ?? "Tidepool"}
                  </div>
                </div>
                <div {...stylex.props(styles.mailFoot)}>
                  <Trans>
                    <Check size={14} strokeWidth={2.2} aria-hidden />{" "}
                    Unsubscribe in one click, any time
                  </Trans>
                </div>
              </div>
            </div>

            <div>
              <h3 {...stylex.props(styles.splitTitle, styles.h2Panel)}>
                <Trans>One tasteful email a week</Trans>
              </h3>
              <p {...stylex.props(styles.panelPara, styles.panelParaSpaced)}>
                <Trans>
                  Don’t want another app to check? Opt into a weekly email with
                  the best of the publications you subscribe to, plus a couple
                  worth discovering. One email, one click to leave — and you can
                  preview exactly what it looks like before you ever turn it on.
                </Trans>
              </p>
              <CtaButton to="/settings" variant="ghost" icon={Mail}>
                <Trans>Turn on in Settings</Trans>
              </CtaButton>
            </div>
          </div>
        </div>

        <div {...stylex.props(styles.panel, styles.panelStacked)}>
          <div {...stylex.props(styles.panelSplit)}>
            <div>
              <h3 {...stylex.props(styles.splitTitle, styles.h2Panel)}>
                <Trans>Take any of it as RSS</Trans>
              </h3>
              <p {...stylex.props(styles.panelPara, styles.panelParaSpaced)}>
                <Trans>
                  And if your reader of choice is one you already have, any
                  slice of the network comes with its own feed — pipe it
                  straight in and never open this app at all.
                </Trans>
              </p>
              <p {...stylex.props(styles.panelPara)}>
                <Trans>
                  Everything here is linkable, too. Publications, lists, and
                  collections each get a clean URL with a rich preview card —
                  plus a subscribe button a publication can drop straight onto
                  its own site.
                </Trans>
              </p>
            </div>
            <div {...stylex.props(styles.feeds)}>
              {RSS_FEEDS.map((what, i) => (
                <div
                  key={what.id}
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
                  <span {...stylex.props(styles.feedWhat)}>{i18n._(what)}</span>
                  <span {...stylex.props(styles.feedTag)}>/ rss</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Developer platform ── */}
      <section {...stylex.props(styles.section)}>
        <SectionHead
          title={t`Build on the same index`}
          dek={t`Everything this app runs on is public. The schemas are open, the read-model is queryable, and the renderer that draws these pages is published for you to use — so a reading app, a search tool, or a better client than this one is a weekend, not a platform deal.`}
        />

        <div {...stylex.props(styles.split)}>
          <div {...stylex.props(styles.code)}>
            <div {...stylex.props(styles.codeBar)}>
              <Terminal size={14} aria-hidden />
              <span>
                <Trans>Public API — no key required</Trans>
              </span>
            </div>
            <pre {...stylex.props(styles.codePre)}>
              <span {...stylex.props(styles.codeCmd)}>GET</span>{" "}
              <span {...stylex.props(styles.codeUrl)}>
                /xrpc/app.standard-reader.getTrendingPublications?limit=1
              </span>
              {"\n\n{\n  "}
              <span {...stylex.props(styles.codeKey)}>&quot;items&quot;</span>
              {": [\n    {\n      "}
              <span {...stylex.props(styles.codeKey)}>&quot;name&quot;</span>
              {": "}
              <span {...stylex.props(styles.codeStr)}>
                {JSON.stringify(samplePub?.name ?? "The Almanac")}
              </span>
              {",\n      "}
              {/* `did`, not the full `uri` — an at-uri wraps and shatters the
                  JSON indentation at this column width, and the repo owner is
                  the interesting half of it either way. */}
              <span {...stylex.props(styles.codeKey)}>&quot;did&quot;</span>
              {": "}
              <span {...stylex.props(styles.codeStr)}>
                {JSON.stringify(samplePub?.did ?? "did:plc:example")}
              </span>
              {",\n      "}
              <span {...stylex.props(styles.codeKey)}>
                &quot;documentCount&quot;
              </span>
              {": "}
              <span {...stylex.props(styles.codeNum)}>
                {samplePub?.documentCount ?? 0}
              </span>
              {",\n      "}
              <span {...stylex.props(styles.codeKey)}>
                &quot;subscriberCount&quot;
              </span>
              {": "}
              <span {...stylex.props(styles.codeNum)}>
                {samplePub?.subscriberCount ?? 0}
              </span>
              {"\n    }\n  ]\n}"}
            </pre>
          </div>

          <div>
            <p {...stylex.props(styles.splitPara)}>
              <Trans>
                That is a real response from the endpoint this page just called
                — no key, no sign-up, no rate-limit form. The same is true of
                every feed, directory, and search query the reader itself runs.
              </Trans>
            </p>
            <p {...stylex.props(styles.splitPara, styles.splitParaLast)}>
              <Trans>
                There’s an MCP server on the same host, so you can point an
                agent at the network too.
              </Trans>
            </p>
            <div {...stylex.props(styles.ctaRow, styles.discoverCta)}>
              <CtaButton to="/docs/introduction" variant="ink" trailingArrow>
                <Trans>Read the docs</Trans>
              </CtaButton>
            </div>
          </div>
        </div>

        <div {...stylex.props(styles.devList)}>
          {DOCS_SURFACES.map((s) => (
            <div key={s.to} {...stylex.props(styles.devItem)}>
              <Link to={s.to} {...stylex.props(styles.devLink)}>
                {i18n._(s.label)}
              </Link>
              <p {...stylex.props(styles.devWhat)}>{i18n._(s.what)}</p>
            </div>
          ))}
        </div>

        <div {...stylex.props(styles.pkgRow)}>
          <span {...stylex.props(styles.pkgLabel)}>
            <Trans>Render a document in your own app —</Trans>{" "}
            <span {...stylex.props(styles.pkgPrefix)}>
              @standard-reader/renderer-
            </span>
          </span>
          {RENDERER_PACKAGES.map((name) => (
            <span key={name} {...stylex.props(styles.pkgChip)}>
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── Closing ── */}
      <section {...stylex.props(styles.close)}>
        <h2 {...stylex.props(styles.closeTitle)}>
          <Trans>Start with a single publication</Trans>
        </h2>
        <p {...stylex.props(styles.closeDek)}>
          <Trans>
            Read without an account. Sign in with Bluesky when you want to
            subscribe, like, and save — and take all of it with you, wherever
            you choose to read next.
          </Trans>
        </p>
        <div {...stylex.props(styles.ctaRow, styles.heroCtaRow)}>
          <CtaButton to="/discover" variant="primary" trailingArrow>
            <Trans>Get started</Trans>
          </CtaButton>
        </div>
      </section>
    </article>
  );
}
