"use client";

import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  CircleCheck,
  EyeOff,
  Heart,
  Plus,
} from "lucide-react";
import { Fragment, useCallback } from "react";

import { AuthorProfileLink } from "#/components/reader/author-profile-link";
import { FollowUserButton } from "#/components/reader/follow-user-button";
import { PublicationNameLink } from "#/components/reader/publication-name-link";
import { SearchHeadline } from "#/components/reader/search-headline";
import { ButtonLink } from "#/components/router-links";
import { DirectionalIcon } from "#/design-system/directional-icon";
import { gap } from "#/design-system/theme/semantic-spacing.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex.tsx";
import type { FollowStatus } from "#/integrations/tanstack-query/api-reader.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { parseInternalRoute } from "#/lib/internal-route";
import { tsHeadlineHasMatch } from "#/lib/search-headline";
import { useFormatters } from "#/lib/use-formatters";
import { useOpenCollectionsInMagazine } from "#/lib/use-open-collections-in-magazine";
import { useOpenLinks } from "#/lib/use-open-links";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";
import { useLoginSearch } from "#/utils/use-login-search";

import {
  AspectRatio,
  AspectRatioImage,
} from "../../design-system/aspect-ratio";
import { Button } from "../../design-system/button";
import { Flex } from "../../design-system/flex";
import { IconButton } from "../../design-system/icon-button";
import { Skeleton } from "../../design-system/skeleton";
import { animationDuration } from "../../design-system/theme/animations.stylex";
import {
  criticalColor,
  primaryColor,
  uiColor,
} from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import { shadow } from "../../design-system/theme/shadow.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../../design-system/theme/typography.stylex";
import { Text } from "../../design-system/typography/text";
import type { FriendPerson } from "../../integrations/tanstack-query/api-discover.functions";
import type {
  ArticleCard,
  PublicationCard,
} from "../../integrations/tanstack-query/api-shapes";
import {
  applyFollowOptimisticUpdate,
  invalidateFollowQueries,
  rollbackFollowOptimisticUpdate,
} from "./follow-optimistic";
import {
  documentLinkParams,
  formatReaders,
  publicationLinkParams,
} from "./format";
import { formatTaggedPostCount } from "./format-i18n";
import { LabelerPill } from "./labeler-pill";
import {
  ArticleEngagement,
  Handle,
  MetaGroup,
  MetaLine,
  MetaText,
  PublicationAvatar,
  Topic,
} from "./primitives";
import {
  applyMarkReadOptimisticUpdate,
  applyMarkUnreadOptimisticUpdate,
  invalidateReadQueries,
} from "./read-optimistic";
import { useArticleBookmark } from "./use-article-bookmark";

const styles = stylex.create({
  cardLink: {
    textDecoration: "none",
    color: "inherit",
    cursor: "pointer",
    display: "block",
    // Card text is user-generated — publication names, `@handle`s and titles can
    // all be long unbreakable tokens (`@a-very-long-handle.bsky.social`). Those
    // offer no break opportunity, so they overflow the card and push the whole
    // page sideways. `anywhere` (not `break-word`) also shrinks the intrinsic
    // min-content width, which is what keeps the surrounding grid track from
    // being forced wider. Inherited, so it covers every text node in the card.
    overflowWrap: "anywhere",
  },
  cardShell: {
    textDecoration: "none",
    color: "inherit",
    cursor: "pointer",
    display: "block",
    position: "relative",
    // See `cardLink` — long unbreakable names/handles must wrap, not overflow.
    overflowWrap: "anywhere",
  },
  cardOverlay: {
    inset: 0,
    borderRadius: "inherit",
    position: "absolute",
    zIndex: 0,
  },
  cardInertRoot: {
    display: "contents",
    pointerEvents: "none",
  },
  cardInteractive: {
    pointerEvents: "auto",
    position: "relative",
    zIndex: 1,
  },
  byline: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  bylineName: {
    // Single-line NAME/TITLE in a UI row: isolate for ordering, but let
    // alignment follow the surrounding UI (right under RTL).
    unicodeBidi: "isolate",
    color: uiColor.text2,
  },
  bylineEyebrow: {
    textDecoration: "none",
    alignItems: "center",
    color: "inherit",
    columnGap: gap.md,
    cursor: "pointer",
    display: "inline-flex",
    rowGap: gap.md,
  },
  ownerHandleLink: {
    color: uiColor.text1,
  },
  pubDirHandle: {
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  bylineWhen: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
  },
  recommendedByLine: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  // A quiet tint on the heart so the "Recommended by" eyebrow reads as a
  // recommendation at a glance — noticeable, but the text stays muted so it
  // never competes with the title.
  recommendedByHeart: {
    alignItems: "center",
    color: criticalColor.solid1,
    display: "inline-flex",
    flexShrink: 0,
  },
  recommendedByName: {
    color: uiColor.text2,
    textDecoration: "none",
  },
  feature: {
    alignItems: "center",
    columnGap: spacing["9"],
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 48rem)": "1.05fr 1fr",
    },
    rowGap: spacing["9"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["9"],
  },
  featureTextOnly: {
    display: "block",
  },
  featureMedia: {
    borderRadius: radius.md,
    overflow: "hidden",
    aspectRatio: "4 / 3",
    objectFit: "cover",
    height: "100%",
    width: "100%",
  },
  featureTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: { default: "1.75rem", "@media (min-width: 48rem)": "2.4rem" },
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  featureDek: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
  },
  row: {
    alignItems: "start",
    columnGap: gap["5xl"],
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 40rem)": "1fr 150px",
    },
    rowGap: gap["5xl"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["6"],
    paddingTop: spacing["6"],
  },
  rowShell: {
    gap: gap["2xl"],
    display: "flex",
    flexDirection: "column",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    // See `cardLink` — long unbreakable names/handles must wrap, not overflow.
    overflowWrap: "anywhere",
    paddingBottom: spacing["6"],
    paddingTop: spacing["6"],
  },
  rowShellFirstInSection: {
    paddingTop: spacing["0"],
  },
  rowGrid: {
    alignItems: "start",
    columnGap: gap["5xl"],
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 40rem)": "1fr 150px",
    },
    rowGap: gap["5xl"],
  },
  featureShell: {
    gap: gap["5xl"],
    display: "flex",
    flexDirection: "column",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["9"],
  },
  featureGrid: {
    alignItems: "center",
    columnGap: spacing["9"],
    display: "grid",
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 48rem)": "1.05fr 1fr",
    },
    rowGap: spacing["9"],
  },
  rowNoMedia: {
    gridTemplateColumns: "1fr",
  },
  rowNoMediaSaveAside: {
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 40rem)": "1fr auto",
    },
  },
  rowSaveBesideMedia: {
    gridTemplateColumns: {
      default: "1fr",
      "@media (min-width: 40rem)": "1fr 150px auto",
    },
  },
  rowSaveAside: {
    alignSelf: "start",
    flexShrink: 0,
  },
  rowFirstInSection: {
    paddingTop: spacing["0"],
  },
  rowHeader: {
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  saveActive: {
    color: primaryColor.solid1,
  },
  rowTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  rowDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.sm,
  },
  rowMedia: {
    borderRadius: radius.md,
    alignSelf: "start",
    display: { default: "none", "@media (min-width: 40rem)": "block" },
    width: "150px",
  },
  unreadDot: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.solid1,
    display: "inline-block",
    flexShrink: 0,
    height: "7px",
    marginTop: spacing["2"],
    width: "7px",
  },
  unreadDotCentered: {
    marginTop: spacing["0"],
  },
  unreadDotRow: {
    marginTop: spacing["1"],
  },
  compactRow: {
    alignItems: "baseline",
    columnGap: gap["3xl"],
    display: "flex",
    rowGap: gap["3xl"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: { default: 1, ":last-child": 0 },
    paddingBottom: spacing["3.5"],
    paddingTop: spacing["3.5"],
  },
  rank: {
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    width: "1.4rem",
  },
  compactTitle: {
    // Single-line NAME/TITLE in a UI row: isolate for ordering, but let
    // alignment follow the surrounding UI (right under RTL).
    unicodeBidi: "isolate",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
  },
  miniRowLink: {
    borderRadius: radius.sm,
    backgroundColor: {
      default: "transparent",
      ":hover": uiColor.component1,
    },
    display: "block",
    marginInlineStart: `calc(-1 * ${spacing["4"]})`,
    marginInlineEnd: `calc(-1 * ${spacing["4"]})`,
    paddingInlineStart: spacing["4"],
    paddingInlineEnd: spacing["4"],
  },
  miniRowBody: {
    alignItems: "center",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3"],
    paddingTop: spacing["3"],
    width: "100%",
  },
  miniRowBodyLast: {
    borderBottomWidth: 0,
  },
  miniRowArrow: {
    color: uiColor.text1,
    flexShrink: 0,
  },
  miniName: {
    // Single-line NAME/TITLE in a UI row: isolate for ordering, but let
    // alignment follow the surrounding UI (right under RTL).
    unicodeBidi: "isolate",
    overflow: "hidden",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  grow: {
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    minWidth: 0,
  },
  titleRow: {
    width: "100%",
  },
  titleInRow: {
    // Single-line NAME/TITLE in a UI row: isolate for ordering, but let
    // alignment follow the surrounding UI (right under RTL).
    unicodeBidi: "isolate",
    flexBasis: "0%",
    flexGrow: "1",
    flexShrink: "1",
    // eslint-disable-next-line @stylexjs/valid-styles
    textWrap: "balance",
    minWidth: 0,
  },
  titleRowDate: {
    flexShrink: 0,
  },
  titleRowDateFeature: {
    paddingTop: spacing["1.5"],
  },
  metaDot: {
    color: uiColor.text1,
  },
  collectionMagMeta: {
    alignItems: "center",
    color: primaryColor.text2,
    columnGap: gap.xs,
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.wide,
    rowGap: gap.xs,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  unreadDotFeature: {
    marginTop: spacing["1.5"],
  },
  pubCard: {
    borderColor: {
      default: uiColor.border1,
      ":hover": uiColor.border2,
    },
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.bgSubtle,
    boxShadow: {
      default: null,
      ":hover": shadow.sm,
    },
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    scrollSnapAlign: "start",
    transform: {
      default: null,
      ":hover": "translateY(-2px)",
    },
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "border-color, box-shadow, transform",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    height: "100%",
    paddingBottom: spacing["5"],
    paddingInlineStart: spacing["5"],
    paddingInlineEnd: spacing["5"],
    paddingTop: spacing["5"],
  },
  pubCardRail: {
    alignSelf: "stretch",
    width: {
      default: "260px",
      "@media (min-width: 40rem)": "300px",
    },
  },
  pubCardHead: {
    marginBottom: spacing["3.5"],
    width: "100%",
  },
  pubCardName: {
    // Single-line NAME/TITLE in a UI row: isolate for ordering, but let
    // alignment follow the surrounding UI (right under RTL).
    unicodeBidi: "isolate",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    marginTop: spacing["0"],
  },
  pubCardDesc: {
    color: uiColor.text1,
    flexBasis: "0%",
    flexGrow: 1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["2.5"],
  },
  pubCardDescClamp: {
    display: "-webkit-box",
    flexBasis: "auto",
    flexGrow: 0,
    overflow: "hidden",
    // eslint-disable-next-line @stylexjs/valid-styles
    WebkitBoxOrient: "vertical",
    // eslint-disable-next-line @stylexjs/valid-styles
    WebkitLineClamp: 3,
  },
  pubCardGrow: {
    flexBasis: "0%",
    flexGrow: 1,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
  },
  pubCardFootWrap: {
    flexShrink: 0,
    marginTop: "auto",
    paddingTop: spacing["4"],
    width: "100%",
  },
  pubCardFoot: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingTop: spacing["3"],
    width: "100%",
  },
  followSlot: {
    flexShrink: 0,
  },
  pubDirRow: {
    alignItems: {
      default: "start",
      "@media (min-width: 40rem)": "flex-start",
    },
    columnGap: spacing["4"],
    display: {
      default: "grid",
      "@media (min-width: 40rem)": "flex",
    },
    gridTemplateColumns: {
      default: "auto 1fr auto",
      "@media (min-width: 40rem)": "none",
    },
    rowGap: {
      default: spacing["3"],
      "@media (min-width: 40rem)": spacing["4"],
    },
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
  },
  pubDirRowRanked: {
    gridTemplateColumns: {
      default: "auto auto 1fr auto",
      "@media (min-width: 40rem)": "none",
    },
  },
  pubDirRowLast: {
    borderBottomWidth: 0,
  },
  pubDirRowFirstInSection: {
    paddingTop: spacing["0"],
  },
  // Owner-only: a pub that opted out of discovery. Muted to read as "not public"
  // while staying legible; the badge alongside says why.
  pubDirDimmed: {
    opacity: 0.5,
  },
  pubHiddenBadge: {
    alignItems: "center",
    backgroundColor: uiColor.bgSubtle,
    borderColor: uiColor.border2,
    borderStyle: "solid",
    borderWidth: 1,
    borderRadius: radius.full,
    color: uiColor.text1,
    columnGap: spacing["1"],
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
    paddingBlock: spacing["0.5"],
    paddingInline: spacing["2"],
    whiteSpace: "nowrap",
  },
  pubCardSkeleton: {
    pointerEvents: "none",
  },
  pubDirRowSkeleton: {
    pointerEvents: "none",
  },
  pubCardSkeletonDesc: {
    flexBasis: "0%",
    flexGrow: 1,
    marginTop: spacing["2.5"],
  },
  pubCardSkeletonHandle: {
    marginTop: spacing["2"],
  },
  pubDirRank: {
    gridColumn: {
      default: "1",
      "@media (min-width: 40rem)": "auto",
    },
    gridRow: {
      default: "1",
      "@media (min-width: 40rem)": "auto",
    },
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    paddingTop: spacing["3"],
    width: spacing["6"],
  },
  pubDirAvatar: {
    gridColumn: {
      default: "1",
      "@media (min-width: 40rem)": "auto",
    },
    gridRow: {
      default: "1",
      "@media (min-width: 40rem)": "auto",
    },
  },
  pubDirAvatarRanked: {
    gridColumn: {
      default: "2",
      "@media (min-width: 40rem)": "auto",
    },
  },
  pubDirMain: {
    display: {
      default: "contents",
      "@media (min-width: 40rem)": "flex",
    },
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    rowGap: gap.sm,
    minWidth: 0,
  },
  pubDirFollow: {
    gridColumn: {
      default: "3",
      "@media (min-width: 40rem)": "auto",
    },
    gridRow: {
      default: "1",
      "@media (min-width: 40rem)": "auto",
    },
  },
  pubDirFollowRanked: {
    gridColumn: {
      default: "4",
      "@media (min-width: 40rem)": "auto",
    },
  },
  pubDirTop: {
    gridColumn: {
      default: "2",
      "@media (min-width: 40rem)": "auto",
    },
    gridRow: {
      default: "1",
      "@media (min-width: 40rem)": "auto",
    },
    // Name and `@handle` sit on one line at every width. They used to stack
    // below 40rem, which cost a whole row per result and read as two separate
    // facts rather than one byline. `wrap` still lets the handle drop to its
    // own line when a long name genuinely leaves it no room.
    alignItems: "baseline",
    columnGap: spacing["2"],
    display: "flex",
    flexDirection: "row",
    // Wrap rather than truncate: the handle drops to its own line only when a
    // long name genuinely leaves no room. Truncating either one costs the
    // reader real information on a directory of unfamiliar publications.
    flexWrap: "wrap",
    rowGap: spacing["0.5"],
    minWidth: 0,
  },
  pubDirTopRanked: {
    gridColumn: {
      default: "3",
      "@media (min-width: 40rem)": "auto",
    },
  },
  pubDirName: {
    // Single-line NAME/TITLE in a UI row: isolate for ordering, but let
    // alignment follow the surrounding UI (right under RTL).
    unicodeBidi: "isolate",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    // A step down on phones: at `xl` the name alone eats the row, pushing the
    // handle onto a second line for all but the shortest names.
    fontSize: {
      default: fontSize.lg,
      "@media (min-width: 40rem)": fontSize.xl,
    },
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    overflowWrap: "anywhere",
    maxWidth: "100%",
    minWidth: 0,
  },
  pubDirDesc: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.sm,
    overflowWrap: "anywhere",
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    maxWidth: {
      default: "none",
      "@media (min-width: 40rem)": "64ch",
    },
    minWidth: 0,
  },
  pubDirExtra: {
    gridColumn: {
      default: "1 / -1",
      "@media (min-width: 40rem)": "auto",
    },
    gridRow: {
      default: "2",
      "@media (min-width: 40rem)": "auto",
    },
    display: "flex",
    flexDirection: "column",
    rowGap: gap.sm,
    minWidth: 0,
  },
  pubDirExtraRanked: {
    gridColumn: {
      default: "2 / -1",
      "@media (min-width: 40rem)": "auto",
    },
  },
  modalPubRow: {
    alignItems: "center",
    columnGap: spacing["3.5"],
    display: "flex",
    rowGap: spacing["3.5"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3"],
    paddingTop: spacing["3"],
  },
  modalPubRowLast: {
    borderBottomWidth: 0,
    paddingBottom: spacing["0"],
  },
  modalPubRowLink: {
    alignItems: "center",
    columnGap: spacing["3.5"],
    display: "flex",
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    rowGap: spacing["3.5"],
    minWidth: 0,
  },
  modalPubName: {
    // Single-line NAME/TITLE in a UI row: isolate for ordering, but let
    // alignment follow the surrounding UI (right under RTL).
    unicodeBidi: "isolate",
    overflow: "hidden",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  modalPubMeta: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.tight,
  },
  // Keeps a Latin/numeric run (handle, topic, counts) from being reordered by
  // the bidi algorithm when it shares a line with RTL UI text.
  bidiIsolate: {
    unicodeBidi: "isolate",
  },
  followResponsiveIcon: {
    alignItems: "center",
    display: {
      default: "inline-flex",
      "@media (min-width: 40rem)": "none",
    },
    flexShrink: 0,
    justifyContent: "center",
  },
  followResponsiveFull: {
    display: {
      default: "none",
      "@media (min-width: 40rem)": "inline-flex",
    },
  },
});

/* ── Follow toggle ──────────────────────────────────────────────────────── */

/** Nested inside {@link PublicationLink} cards — block parent navigation. */
function stopFollowClick(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

/** Signed-out follow links still navigate to login; only isolate from parent. */
function stopFollowBubble(event: React.MouseEvent) {
  event.stopPropagation();
}

export function FollowButton({
  publicationUri,
  signedIn,
  size = "sm",
  pub,
  initialFollowing,
  responsive = true,
  style,
}: {
  publicationUri: string;
  signedIn: boolean;
  size?: "sm" | "md";
  /** Publication card for optimistic sidebar updates when toggling follow. */
  pub?: PublicationCard;
  /** @deprecated Prefer letting the button read follow status from React Query. */
  initialFollowing?: boolean;
  /** When false, always renders the labeled button, skipping the icon-only mobile variant. */
  responsive?: boolean;
  style?: stylex.StyleXStyles;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const loginSearch = useLoginSearch();
  const { data: followStatus } = useQuery({
    ...readerApi.getFollowStatusQueryOptions(publicationUri),
    enabled: signedIn,
    ...(initialFollowing === undefined
      ? {}
      : {
          initialData: { isFollowing: initialFollowing } satisfies FollowStatus,
        }),
  });
  const following = followStatus?.isFollowing ?? false;
  const followMutation = useMutation(
    readerApi.followPublicationMutationOptions(),
  );
  const unfollowMutation = useMutation(
    readerApi.unfollowPublicationMutationOptions(),
  );
  const followLabel = following ? t`Subscribed` : t`Subscribe`;
  const mobileIconSize = 20;
  const icon = following ? (
    <Check size={mobileIconSize} aria-hidden />
  ) : (
    <Plus size={mobileIconSize} aria-hidden />
  );
  const desktopIconSize = size === "md" ? 18 : 15;
  const desktopIcon = following ? (
    <Check size={desktopIconSize} aria-hidden />
  ) : (
    <Plus size={desktopIconSize} aria-hidden />
  );

  if (!signedIn) {
    if (!responsive) {
      return (
        <ButtonLink
          to="/login"
          search={loginSearch}
          variant="secondary"
          size={size}
          style={style}
          onClick={stopFollowBubble}
        >
          {desktopIcon} <Trans>Follow</Trans>
        </ButtonLink>
      );
    }
    return (
      <>
        <ButtonLink
          to="/login"
          search={loginSearch}
          variant="secondary"
          aria-label={t`Subscribe`}
          style={styles.followResponsiveIcon}
          onClick={stopFollowBubble}
        >
          <Plus size={mobileIconSize} aria-hidden />
        </ButtonLink>
        <ButtonLink
          to="/login"
          search={loginSearch}
          variant="secondary"
          size={size}
          style={styles.followResponsiveFull}
          onClick={stopFollowBubble}
        >
          {desktopIcon} <Trans>Follow</Trans>
        </ButtonLink>
      </>
    );
  }

  const onPress = () => {
    const next = !following;
    const mutation = next ? followMutation : unfollowMutation;
    const optimistic = applyFollowOptimisticUpdate(queryClient, {
      publicationUri,
      pub,
      following: next,
    });
    mutation.mutate(publicationUri, {
      onError: () =>
        rollbackFollowOptimisticUpdate(queryClient, publicationUri, optimistic),
      onSettled: () => invalidateFollowQueries(queryClient),
    });
  };

  if (!responsive) {
    return (
      <Button
        variant={following ? "secondary" : "primary"}
        size={size}
        onPress={onPress}
        onClick={stopFollowClick}
        style={style}
      >
        {desktopIcon}
        {followLabel}
      </Button>
    );
  }

  return (
    <>
      <IconButton
        variant={following ? "secondary" : "primary"}
        label={followLabel}
        onPress={onPress}
        onClick={stopFollowClick}
        style={styles.followResponsiveIcon}
      >
        {icon}
      </IconButton>
      <Button
        variant={following ? "secondary" : "primary"}
        size={size}
        onPress={onPress}
        onClick={stopFollowClick}
        style={styles.followResponsiveFull}
      >
        {desktopIcon}
        {followLabel}
      </Button>
    </>
  );
}

function OwnerHandleLink({
  did,
  handle,
  style,
}: {
  did: string;
  handle: string;
  /** Extra styles for the link box (e.g. the directory row's shrink rules). */
  style?: stylex.StyleXStyles;
}) {
  return (
    <AuthorProfileLink
      authorRef={did}
      linkStyle={[styles.ownerHandleLink, styles.cardInteractive, style]}
    >
      <Handle>@{handle}</Handle>
    </AuthorProfileLink>
  );
}

/* ── Recommended-by attribution ─────────────────────────────────────────── */

/**
 * "Recommended by @handle" line shown above the byline in the home/latest feed
 * when an article surfaced because followed users recommended it. A single line
 * covers all recommenders ("+N others") — the article is one collapsed card.
 */
function RecommendedByLine({ article }: { article: ArticleCard }) {
  const recommenders = article.recommendedBy;
  if (!recommenders || recommenders.length === 0) {
    return null;
  }
  const first = recommenders[0];
  const firstName =
    first.displayName ?? (first.handle ? `@${first.handle}` : "Someone");
  const others = recommenders.length - 1;

  return (
    <Flex align="center" gap="sm" style={styles.recommendedByLine}>
      <span {...stylex.props(styles.recommendedByHeart)}>
        <Heart size={13} aria-hidden fill="currentColor" />
      </span>
      <span>
        Recommended by{" "}
        <AuthorProfileLink
          authorRef={first.did}
          linkStyle={styles.recommendedByName}
          nested
        >
          {firstName}
        </AuthorProfileLink>
        {others > 0
          ? ` and ${others} ${others === 1 ? "other" : "others"}`
          : null}
      </span>
    </Flex>
  );
}

/* ── Byline ─────────────────────────────────────────────────────────────── */

function Byline({
  article,
  includeDate = false,
}: {
  article: ArticleCard;
  includeDate?: boolean;
}) {
  const fmt = useFormatters();
  const date = fmt.date(article.publishedAt);

  // Loose documents have no publication row, so the byline shows the author's
  // profile (handle / avatar) and links to `/u/$did` instead of a publication.
  const isLoose = article.publicationName == null;
  const authorName =
    article.authorDisplayName ??
    (article.authorHandle ? `@${article.authorHandle}` : null);
  const authorAvatar =
    article.authorAvatarUrl ?? article.publicationOwnerAvatarUrl ?? null;

  return (
    <Flex align="center" gap="md" wrap style={styles.byline}>
      {isLoose && authorName && article.did ? (
        <AuthorProfileLink
          authorRef={article.did}
          linkStyle={styles.bylineEyebrow}
          nested
        >
          <PublicationAvatar
            pub={{
              name: authorName,
              iconUrl: null,
              ownerAvatarUrl: authorAvatar,
            }}
            size="sm"
          />
          <span {...stylex.props(styles.bylineName)}>{authorName}</span>
        </AuthorProfileLink>
      ) : (
        <PublicationNameLink
          publicationUri={article.publicationUri}
          linkStyle={styles.bylineEyebrow}
          nested
        >
          <PublicationAvatar
            pub={{
              name: article.publicationName ?? "Unknown",
              iconUrl: article.publicationIconUrl,
              ownerAvatarUrl: article.publicationOwnerAvatarUrl,
            }}
            size="sm"
          />
          <span {...stylex.props(styles.bylineName)}>
            {article.publicationName ?? "Unknown publication"}
          </span>
        </PublicationNameLink>
      )}
      {includeDate && date ? (
        <>
          <span aria-hidden {...stylex.props(styles.metaDot)}>
            ·
          </span>
          <span {...stylex.props(styles.bylineWhen)}>{date}</span>
        </>
      ) : null}
    </Flex>
  );
}

function TitleRowDate({
  publishedAt,
  style,
}: {
  publishedAt: string;
  style?: stylex.StyleXStyles;
}) {
  const fmt = useFormatters();
  const date = fmt.date(publishedAt);
  if (!date) return null;
  return (
    <span {...stylex.props(styles.bylineWhen, styles.titleRowDate, style)}>
      {date}
    </span>
  );
}

function ArticleTitleContent({
  article,
  titleStyle,
}: {
  article: ArticleCard;
  titleStyle: stylex.StyleXStyles;
}) {
  if (article.searchTitleHtml && tsHeadlineHasMatch(article.searchTitleHtml)) {
    return (
      <SearchHeadline
        html={article.searchTitleHtml}
        style={[titleStyle, styles.titleInRow]}
      />
    );
  }

  return <Text style={[titleStyle, styles.titleInRow]}>{article.title}</Text>;
}

function ArticleSearchDek({
  article,
  style,
}: {
  article: ArticleCard;
  style: stylex.StyleXStyles;
}) {
  if (article.searchSnippetHtml) {
    return <SearchHeadline html={article.searchSnippetHtml} style={style} />;
  }

  if (article.description) {
    return (
      <span dir="auto" {...stylex.props(style)}>
        {article.description}
      </span>
    );
  }

  return null;
}

function ArticleTitleRow({
  article,
  showByline,
  unread,
  titleStyle,
  unreadDotStyle,
  dateStyle,
}: {
  article: ArticleCard;
  showByline: boolean;
  unread: boolean;
  titleStyle: stylex.StyleXStyles;
  unreadDotStyle?: stylex.StyleXStyles;
  dateStyle?: stylex.StyleXStyles;
}) {
  if (showByline) {
    return (
      <Flex gap="md" align="baseline" style={styles.titleRow}>
        {unread ? (
          <span {...stylex.props(styles.unreadDot, unreadDotStyle)} />
        ) : null}
        <ArticleTitleContent article={article} titleStyle={titleStyle} />
      </Flex>
    );
  }

  return (
    <Flex
      gap="md"
      align={dateStyle ? "start" : "center"}
      justify="between"
      style={styles.titleRow}
    >
      <Flex gap="md" align="start" style={styles.grow}>
        {unread ? (
          <span
            {...stylex.props(
              styles.unreadDot,
              styles.unreadDotCentered,
              unreadDotStyle,
            )}
          />
        ) : null}
        <ArticleTitleContent article={article} titleStyle={titleStyle} />
      </Flex>
      <TitleRowDate publishedAt={article.publishedAt} style={dateStyle} />
    </Flex>
  );
}

/** Magazine-edition badge for collection documents in feed rows. */
function CollectionMagazineMeta() {
  return (
    <span {...stylex.props(styles.collectionMagMeta)}>
      <BookOpen size={13} aria-hidden strokeWidth={2} />
      Collection
    </span>
  );
}

function ArticleMetaLine({
  article,
  metaLabels,
}: {
  article: ArticleCard;
  /** When set, replaces article tags in the meta line (e.g. labeler label values). */
  metaLabels?: Array<{ src: string; val: string }>;
}) {
  const hasEngagement = article.recommendCount > 0 || article.commentCount > 0;
  const topics = metaLabels == null ? articleTopics(article) : [];
  // Labels from the reader's subscribed labelers (attached server-side), shown
  // alongside the article's tags. Skipped when `metaLabels` overrides the line.
  // De-duped by `val` (first emitting labeler wins) but keeps `src` so each
  // pill can resolve its display name and link to the labeler.
  const cardLabelVals =
    metaLabels == null
      ? (() => {
          const byVal = new Map<string, { src: string; val: string }>();
          for (const l of article.labels ?? []) {
            if (l.visibility === "ignore") continue;
            if (byVal.has(l.val)) continue;
            byVal.set(l.val, { src: l.src, val: l.val });
          }
          return [...byVal.values()];
        })()
      : [];
  const showCollection = article.isCollection;
  const hasTopics = topics.length > 0;
  const hasCardLabels = cardLabelVals.length > 0;
  const hasMetaLabels = metaLabels != null && metaLabels.length > 0;
  const hasTrailing = hasTopics || hasCardLabels || hasMetaLabels;
  if (!showCollection && !hasEngagement && !hasTrailing) return null;

  return (
    <MetaLine>
      {showCollection ? <CollectionMagazineMeta /> : null}
      {showCollection && (hasEngagement || hasTrailing) ? (
        <span aria-hidden {...stylex.props(styles.metaDot)}>
          ·
        </span>
      ) : null}
      {hasEngagement ? (
        <ArticleEngagement
          recommendCount={article.recommendCount}
          commentCount={article.commentCount}
        />
      ) : null}
      {hasEngagement && hasTrailing ? (
        <span aria-hidden {...stylex.props(styles.metaDot)}>
          ·
        </span>
      ) : null}
      {hasCardLabels ? <LabelValsMeta labels={cardLabelVals} /> : null}
      {hasCardLabels && (hasTopics || hasMetaLabels) ? (
        <span aria-hidden {...stylex.props(styles.metaDot)}>
          ·
        </span>
      ) : null}
      {hasMetaLabels ? (
        <LabelValsMeta labels={metaLabels} />
      ) : (
        <TopicMeta article={article} />
      )}
    </MetaLine>
  );
}

/**
 * Marks an *external* document read when the reader opens it. Internal article
 * navigations mark read once the article page mounts (i.e. after we navigate);
 * external links have no such page, so this is their only trigger. The write is
 * fire-and-forget with an optimistic cache update so the feed reflects it.
 */
function useMarkReadExternal() {
  const queryClient = useQueryClient();
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const { enabled: trackReading } = useTrackReadingHistory();
  const { mutate: markRead } = useMutation(readerApi.markReadMutationOptions());

  return useCallback(
    (documentUri: string, publicationUri?: string | null) => {
      if (!signedIn || !trackReading) return;
      applyMarkReadOptimisticUpdate(queryClient, documentUri, publicationUri);
      markRead(documentUri);
    },
    [signedIn, trackReading, queryClient, markRead],
  );
}

function ArticleLink({
  article,
  children,
  extraStyles = [],
}: {
  article: ArticleCard;
  children: React.ReactNode;
  extraStyles?: Array<stylex.StyleXStyles | false | undefined>;
}) {
  const markReadExternal = useMarkReadExternal();
  const { openExternally } = useOpenLinks();
  const { openInMagazine } = useOpenCollectionsInMagazine();
  const params = documentLinkParams(article.uri);
  const merged = stylex.props(styles.cardLink, ...extraStyles);
  // "Open on original site" preference: bypass the in-app reader whenever the
  // document has a canonical URL on its publication site.
  if (openExternally && article.canonicalUrl) {
    return (
      <a
        href={article.canonicalUrl}
        target="_blank"
        rel="noreferrer"
        onClick={() => markReadExternal(article.uri, article.publicationUri)}
        {...merged}
      >
        {children}
      </a>
    );
  }
  // Only route through the in-app reader when there's a body to render;
  // "external" posts (no renderable body) link straight out in a new tab.
  if (params && article.hasRenderableBody) {
    const collectionMagazine = article.isCollection && openInMagazine;
    return (
      <Link
        to={collectionMagazine ? "/collection/$did/$rkey" : "/a/$did/$rkey"}
        params={params}
        {...merged}
      >
        {children}
      </Link>
    );
  }
  const href = article.canonicalUrl;
  if (href) {
    const internal = parseInternalRoute(href);
    if (internal?.params) {
      return (
        <Link to={internal.to} params={internal.params} {...merged}>
          {children}
        </Link>
      );
    }
    if (internal) {
      return (
        <Link to={internal.to} {...merged}>
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={() => markReadExternal(article.uri, article.publicationUri)}
        {...merged}
      >
        {children}
      </a>
    );
  }
  // No external URL: fall back to the in-app record page when we have an AT-URI
  // (the route resolves/redirects), else render plain children.
  if (params) {
    return (
      <Link to="/a/$did/$rkey" params={params} {...merged}>
        {children}
      </Link>
    );
  }
  return <div {...stylex.props(...extraStyles)}>{children}</div>;
}

function PublicationStretchedLink({
  pub,
  onNavigate,
}: {
  pub: PublicationCard;
  onNavigate?: () => void;
}) {
  const overlay = stylex.props(styles.cardOverlay);
  const params = publicationLinkParams(pub.uri);
  if (params) {
    return (
      <Link
        to="/p/$did/$rkey"
        params={params}
        onClick={onNavigate}
        aria-label={`Open ${pub.name}`}
        {...overlay}
      />
    );
  }
  const href = pub.url;
  if (href) {
    const internal = parseInternalRoute(href);
    if (internal?.params) {
      return (
        <Link
          to={internal.to}
          params={internal.params}
          onClick={onNavigate}
          aria-label={`Open ${pub.name}`}
          {...overlay}
        />
      );
    }
    if (internal) {
      return (
        <Link
          to={internal.to}
          onClick={onNavigate}
          aria-label={`Open ${pub.name}`}
          {...overlay}
        />
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={onNavigate}
        aria-label={`Open ${pub.name} (opens in a new tab)`}
        {...overlay}
      />
    );
  }
  return null;
}

function PublicationLink({
  pub,
  children,
  extraStyles = [],
  onNavigate,
  noLink = false,
}: {
  pub: PublicationCard;
  children: React.ReactNode;
  extraStyles?: Array<stylex.StyleXStyles | false | undefined>;
  onNavigate?: () => void;
  /**
   * Render the card body only — no stretched navigation link. Used when an
   * ancestor already provides the link/press target (e.g. a react-aria
   * `GridListItem`), so the follow button becomes a normal in-row action
   * instead of sitting above a stretched-link overlay.
   */
  noLink?: boolean;
}) {
  const shell = stylex.props(styles.cardShell, ...extraStyles);
  const hasLinkTarget =
    publicationLinkParams(pub.uri) != null || Boolean(pub.url);

  if (noLink || !hasLinkTarget) {
    return <div {...stylex.props(...extraStyles)}>{children}</div>;
  }

  return (
    <div {...shell}>
      <PublicationStretchedLink pub={pub} onNavigate={onNavigate} />
      <div {...stylex.props(styles.cardInertRoot)}>{children}</div>
    </div>
  );
}

/** Cover for an article: only its own cover image (never the Bluesky banner). */
function coverImage(article: ArticleCard): string | null {
  return article.coverImageUrl ?? null;
}

/**
 * Topic labels for an article: its own tags, else the publication topic. In
 * search results any tag that matched the query (`matchedTags`) is pulled to the
 * front so it's always shown — even when it isn't a leading tag — and never
 * dropped by the cap.
 */
function articleTopics(article: ArticleCard): Array<string> {
  if (article.tags && article.tags.length > 0) {
    const matched = article.matchedTags ?? [];
    if (matched.length > 0) {
      const rest = article.tags.filter((tag) => !matched.includes(tag));
      // Keep all matched tags (capped so a many-tag hit can't overflow the line)
      // and fill up to two chips total with the leading remaining tags.
      const lead = matched.slice(0, 3);
      return [...lead, ...rest].slice(0, Math.max(2, lead.length));
    }
    return article.tags.slice(0, 2);
  }
  return article.publicationTopic ? [article.publicationTopic] : [];
}

/** Renders topic chips inside a {@link MetaLine}. */
function TopicMeta({ article }: { article: ArticleCard }) {
  const topics = articleTopics(article);
  const matched = article.matchedTags ?? [];
  return (
    <>
      {topics.map((topic, index) => (
        <Fragment key={topic}>
          {index > 0 ? (
            <span aria-hidden {...stylex.props(styles.metaDot)}>
              ·
            </span>
          ) : null}
          <Topic name={topic} nested active={matched.includes(topic)} />
        </Fragment>
      ))}
    </>
  );
}

/** Renders label values inside a {@link MetaLine}. */
function LabelValsMeta({
  labels,
}: {
  labels: Array<{ src: string; val: string }>;
}) {
  return (
    <>
      {labels.map((label, index) => (
        <Fragment key={`${label.src}:${label.val}`}>
          {index > 0 ? (
            <span aria-hidden {...stylex.props(styles.metaDot)}>
              ·
            </span>
          ) : null}
          <LabelerPill src={label.src} val={label.val} />
        </Fragment>
      ))}
    </>
  );
}

/* ── Feature (hero) ─────────────────────────────────────────────────────── */

export function FeatureArticle({
  article,
  showByline = true,
  unread = false,
}: {
  article: ArticleCard;
  showByline?: boolean;
  unread?: boolean;
}) {
  const cover = coverImage(article);
  const featureGridStyles: Array<stylex.StyleXStyles | false | undefined> = [
    styles.featureGrid,
    cover ? false : styles.featureTextOnly,
  ];
  const articleBody = (
    <>
      {cover ? (
        <span {...stylex.props(styles.featureMedia)}>
          <img
            src={cover}
            alt=""
            referrerPolicy="no-referrer"
            {...stylex.props(styles.featureMedia)}
          />
        </span>
      ) : null}
      <Flex direction="column" gap="5xl">
        <ArticleTitleRow
          article={article}
          showByline={showByline}
          unread={unread}
          titleStyle={styles.featureTitle}
          unreadDotStyle={styles.unreadDotFeature}
          dateStyle={showByline ? undefined : styles.titleRowDateFeature}
        />
        {article.description ? (
          <span dir="auto" {...stylex.props(styles.featureDek)}>
            {article.description}
          </span>
        ) : null}
        <ArticleMetaLine article={article} />
      </Flex>
    </>
  );

  if (showByline) {
    return (
      <div {...stylex.props(styles.featureShell)}>
        <RecommendedByLine article={article} />
        <Byline article={article} includeDate />
        <ArticleLink article={article} extraStyles={featureGridStyles}>
          {articleBody}
        </ArticleLink>
      </div>
    );
  }

  // Byline-less (publication page): the "Recommended by @follow" line still
  // applies. Lift it out of the card link — it holds its own profile links —
  // and let the shell own the row's border so the grid inside stays border-free.
  if (article.recommendedBy && article.recommendedBy.length > 0) {
    return (
      <div {...stylex.props(styles.featureShell)}>
        <RecommendedByLine article={article} />
        <ArticleLink article={article} extraStyles={featureGridStyles}>
          {articleBody}
        </ArticleLink>
      </div>
    );
  }

  return (
    <ArticleLink
      article={article}
      extraStyles={[styles.feature, cover ? false : styles.featureTextOnly]}
    >
      {articleBody}
    </ArticleLink>
  );
}

/** Nested inside article cards — block parent navigation. */
function stopSaveClick(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export function SaveButton({
  documentUri,
  signedIn,
  size = "sm",
  assumeBookmarked,
}: {
  documentUri: string;
  signedIn: boolean;
  size?: "sm" | "md";
  /** Skip per-row status fetch when the parent already knows bookmark state. */
  assumeBookmarked?: boolean;
}) {
  const { t } = useLingui();
  const { bookmarked, toggle, isPending } = useArticleBookmark(
    documentUri,
    signedIn,
    assumeBookmarked === undefined ? undefined : { assumeBookmarked },
  );
  const iconSize = size === "md" ? 18 : 16;
  const label = bookmarked ? t`Saved for later` : t`Save for later`;

  return (
    <IconButton
      variant="secondary"
      size={size}
      label={label}
      isDisabled={isPending}
      onPress={toggle}
      onClick={stopSaveClick}
      style={bookmarked ? styles.saveActive : undefined}
    >
      <Bookmark
        size={iconSize}
        aria-hidden
        fill={bookmarked ? "currentColor" : "none"}
      />
    </IconButton>
  );
}

/**
 * Pushes an already-read document back to unread (deletes its `read` record).
 * Used in the reading-history list; renders nothing when read tracking is off or
 * the reader is signed out (in which case there's no unread state to restore).
 */
export function MarkUnreadButton({
  documentUri,
  publicationUri,
  size = "sm",
}: {
  documentUri: string;
  publicationUri?: string | null;
  size?: "sm" | "md";
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const { enabled: trackReading } = useTrackReadingHistory();
  const { mutate: markUnread, isPending } = useMutation(
    readerApi.markUnreadMutationOptions(),
  );
  const iconSize = size === "md" ? 18 : 16;

  if (!signedIn || !trackReading) return null;

  const onPress = () => {
    applyMarkUnreadOptimisticUpdate(queryClient, documentUri, publicationUri);
    markUnread(documentUri, {
      onError: () => invalidateReadQueries(queryClient),
    });
  };

  return (
    <IconButton
      variant="secondary"
      size={size}
      label={t`Mark as unread`}
      isDisabled={isPending}
      onPress={onPress}
      onClick={stopSaveClick}
      style={styles.saveActive}
    >
      <CircleCheck size={iconSize} aria-hidden />
    </IconButton>
  );
}

/* ── Article row (list) ─────────────────────────────────────────────────── */

export function ArticleRow({
  article,
  unread = false,
  showByline = true,
  showSaveButton = true,
  saveButtonPlacement = "header",
  showMarkUnreadButton = false,
  isFirstInSection = false,
  assumeBookmarked,
  metaLabels,
}: {
  article: ArticleCard;
  unread?: boolean;
  showByline?: boolean;
  showSaveButton?: boolean;
  /** Where the save toggle sits — `besideMedia` places it to the right of the cover. */
  saveButtonPlacement?: "header" | "besideMedia";
  /** Show a "mark as unread" control in the row header (reading-history list). */
  showMarkUnreadButton?: boolean;
  /** Drop top padding when the section head already provides spacing above. */
  isFirstInSection?: boolean;
  /** Skip per-row bookmark status fetches when the list is already the save queue. */
  assumeBookmarked?: boolean;
  /** When set, replaces article tags in the meta line (e.g. labeler label values). */
  metaLabels?: Array<{ src: string; val: string }>;
}) {
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const cover = coverImage(article);
  const saveBesideMedia =
    showSaveButton && saveButtonPlacement === "besideMedia";
  const saveButton = showSaveButton ? (
    <SaveButton
      documentUri={article.uri}
      signedIn={signedIn}
      assumeBookmarked={assumeBookmarked}
    />
  ) : null;

  const markUnreadButton = showMarkUnreadButton ? (
    <MarkUnreadButton
      documentUri={article.uri}
      publicationUri={article.publicationUri}
    />
  ) : null;
  // The save toggle sits in the header by default; `besideMedia` pins it to the
  // row's right edge instead. The unread toggle always pins to the right edge so
  // it lines up across rows regardless of whether a cover image is present.
  const asideSaveButton = saveBesideMedia ? saveButton : null;
  const headerSaveButton = saveBesideMedia ? null : saveButton;
  const hasAside = Boolean(markUnreadButton || asideSaveButton);

  const gridStyles: Array<stylex.StyleXStyles | false | undefined> = [
    showByline ? styles.rowGrid : styles.row,
    !cover && !hasAside ? styles.rowNoMedia : false,
    !cover && hasAside ? styles.rowNoMediaSaveAside : false,
    hasAside && cover ? styles.rowSaveBesideMedia : false,
    !showByline && isFirstInSection ? styles.rowFirstInSection : false,
  ];

  const bylineHeader = (
    <Flex align="center" gap="2xl" style={styles.rowHeader}>
      {showByline ? (
        <Flex direction="column" gap="sm">
          <RecommendedByLine article={article} />
          <Byline article={article} includeDate />
        </Flex>
      ) : (
        // Byline-less (publication page): keep the "Recommended by @follow"
        // attribution — the same follows signal shown on the home/latest feeds.
        <RecommendedByLine article={article} />
      )}
      {headerSaveButton}
    </Flex>
  );

  const articleBody = (
    <ArticleLink article={article} extraStyles={gridStyles}>
      <Flex direction="column" gap="2xl">
        {bylineHeader}
        <ArticleTitleRow
          article={article}
          showByline={showByline}
          unread={unread}
          titleStyle={styles.rowTitle}
          unreadDotStyle={styles.unreadDotRow}
        />
        <ArticleSearchDek article={article} style={styles.rowDek} />
        <ArticleMetaLine article={article} metaLabels={metaLabels} />
      </Flex>
      {cover ? (
        <AspectRatio
          aspectRatio={4 / 3}
          rounded={false}
          style={styles.rowMedia}
        >
          <AspectRatioImage src={cover} alt="" referrerPolicy="no-referrer" />
        </AspectRatio>
      ) : null}
      {hasAside ? (
        <div {...stylex.props(styles.rowSaveAside)}>
          <Flex align="center" gap="sm">
            {markUnreadButton}
            {asideSaveButton}
          </Flex>
        </div>
      ) : null}
    </ArticleLink>
  );

  if (showByline) {
    return (
      <div
        {...stylex.props(
          styles.rowShell,
          isFirstInSection && styles.rowShellFirstInSection,
        )}
      >
        {articleBody}
      </div>
    );
  }

  return articleBody;
}

/* ── Compact row (trending — no image) ──────────────────────────────────── */

export function CompactRow({
  article,
  rank,
}: {
  article: ArticleCard;
  rank: number;
}) {
  const hasEngagement = article.recommendCount > 0 || article.commentCount > 0;
  const showCollection = article.isCollection;
  return (
    <ArticleLink article={article} extraStyles={[styles.compactRow]}>
      <span {...stylex.props(styles.rank)}>
        {String(rank).padStart(2, "0")}
      </span>
      <Flex direction="column" gap="sm" style={styles.grow}>
        <span {...stylex.props(styles.compactTitle)}>{article.title}</span>
        <MetaLine>
          {showCollection ? <CollectionMagazineMeta /> : null}
          {showCollection ? (
            <span aria-hidden {...stylex.props(styles.metaDot)}>
              ·
            </span>
          ) : null}
          {article.publicationName ? (
            <PublicationNameLink publicationUri={article.publicationUri} nested>
              <span>{article.publicationName}</span>
            </PublicationNameLink>
          ) : article.authorHandle && article.did ? (
            <AuthorProfileLink
              authorRef={article.did}
              linkStyle={styles.bylineEyebrow}
            >
              <span {...stylex.props(styles.bidiIsolate)}>
                @{article.authorHandle}
              </span>
            </AuthorProfileLink>
          ) : (
            <span>Unknown</span>
          )}
          {hasEngagement ? (
            <>
              <span aria-hidden {...stylex.props(styles.metaDot)}>
                ·
              </span>
              <ArticleEngagement
                recommendCount={article.recommendCount}
                commentCount={article.commentCount}
              />
            </>
          ) : null}
        </MetaLine>
      </Flex>
    </ArticleLink>
  );
}

/* ── Mini publication row (rails) ───────────────────────────────────────── */

export function MiniPubRow({
  pub,
  isLast = false,
}: {
  pub: PublicationCard;
  isLast?: boolean;
}) {
  return (
    <PublicationLink pub={pub} extraStyles={[styles.miniRowLink]}>
      <Flex
        align="center"
        gap="md"
        style={[styles.miniRowBody, isLast && styles.miniRowBodyLast]}
      >
        <PublicationAvatar pub={pub} size="lg" />
        <Flex direction="column" gap="xs" style={styles.grow}>
          <span {...stylex.props(styles.miniName)}>{pub.name}</span>
          {pub.ownerHandle ? (
            <OwnerHandleLink did={pub.did} handle={pub.ownerHandle} />
          ) : null}
          <PubMetaRow pub={pub} />
        </Flex>
        <DirectionalIcon
          as={ArrowRight}
          size={15}
          style={styles.miniRowArrow}
        />
      </Flex>
    </PublicationLink>
  );
}

/* ── Compact publication row with topic + readers (directory style) ─────── */

export function PubMetaRow({
  pub,
  hideTopic = false,
}: {
  pub: PublicationCard;
  hideTopic?: boolean;
}) {
  const { i18n } = useLingui();
  // These are UI strings, not user content — they must translate and follow the
  // UI direction. `formatReaders` supplies the abbreviated count ("1.2k") for
  // the plural branch, matching the pattern in `format.ts`.
  const subscriberLabel = formatReaders(pub.subscriberCount);
  const documentLabel = formatReaders(pub.documentCount);
  const readers =
    pub.subscriberCount > 0
      ? i18n._(
          msg`${plural(pub.subscriberCount, { one: "# reader", other: `${subscriberLabel} readers` })}`,
        )
      : pub.documentCount > 0
        ? i18n._(
            msg`${plural(pub.documentCount, { one: "# article", other: `${documentLabel} articles` })}`,
          )
        : null;

  const showTopic = !hideTopic && Boolean(pub.topic);
  if (!showTopic && !readers) {
    return null;
  }

  return (
    <MetaLine>
      {showTopic ? <Topic name={pub.topic} nested /> : null}
      {readers ? <MetaText>{readers}</MetaText> : null}
    </MetaLine>
  );
}

function PubReadersMeta({ pub }: { pub: PublicationCard }) {
  const { i18n } = useLingui();
  if (pub.subscriberCount <= 0) return null;
  return (
    <MetaText>
      {i18n._(
        msg`${plural(pub.subscriberCount, { one: "# reader", other: `${formatReaders(pub.subscriberCount)} readers` })}`,
      )}
    </MetaText>
  );
}

function PubDirectoryStats({
  pub,
  hideTopic = false,
  tagPostCount,
}: {
  pub: PublicationCard;
  hideTopic?: boolean;
  /** Tagged-post tally for tag directory rows. */
  tagPostCount?: number;
}) {
  const { i18n } = useLingui();
  const stats: Array<string> = [];
  if (tagPostCount != null) {
    stats.push(formatTaggedPostCount(i18n, tagPostCount));
  }
  if (pub.subscriberCount > 0) {
    stats.push(
      i18n._(
        msg`${plural(pub.subscriberCount, { one: "# reader", other: `${formatReaders(pub.subscriberCount)} readers` })}`,
      ),
    );
  }
  if (tagPostCount == null && pub.documentCount > 0) {
    stats.push(
      i18n._(
        msg`${plural(pub.documentCount, { one: "# post", other: `${formatReaders(pub.documentCount)} posts` })}`,
      ),
    );
  }
  const showTopic = !hideTopic && Boolean(pub.topic);
  if (!showTopic && stats.length === 0) {
    return null;
  }

  return (
    <MetaLine>
      {showTopic ? <Topic name={pub.topic} nested /> : null}
      {stats.length > 0 ? (
        <MetaGroup>
          <Handle>
            {stats.map((part, index) => (
              <span key={part}>
                {index > 0 ? <span aria-hidden> · </span> : null}
                {/* Each stat is its own bidi run (digits + a localized word);
                    isolate so an RTL UI can't interleave them. */}
                <span {...stylex.props(styles.bidiIsolate)}>{part}</span>
              </span>
            ))}
          </Handle>
        </MetaGroup>
      ) : null}
    </MetaLine>
  );
}

function PubCardFoot({
  pub,
  hideTopic = false,
  tagPostCount,
}: {
  pub: PublicationCard;
  hideTopic?: boolean;
  tagPostCount?: number;
}) {
  const { i18n } = useLingui();
  const showTopic = !hideTopic && Boolean(pub.topic);
  const taggedMeta =
    tagPostCount == null ? null : formatTaggedPostCount(i18n, tagPostCount);
  if (!showTopic && !taggedMeta && pub.subscriberCount <= 0) {
    return null;
  }
  return (
    <div {...stylex.props(styles.pubCardFootWrap)}>
      <Flex
        align="center"
        justify="between"
        gap="md"
        style={styles.pubCardFoot}
      >
        {showTopic ? (
          <Topic name={pub.topic} nested />
        ) : taggedMeta ? (
          <Handle>{taggedMeta}</Handle>
        ) : null}
        <PubReadersMeta pub={pub} />
      </Flex>
    </div>
  );
}

function FollowSlot({
  publicationUri,
  signedIn,
  pub,
  style,
}: {
  publicationUri: string;
  signedIn: boolean;
  pub?: PublicationCard;
  style?: stylex.StyleXStyles;
}) {
  return (
    <div
      role="presentation"
      {...stylex.props(styles.followSlot, styles.cardInteractive, style)}
    >
      <FollowButton
        publicationUri={publicationUri}
        signedIn={signedIn}
        pub={pub}
      />
    </div>
  );
}

/* ── Publication card (grid + horizontal rail) ─────────────────────────── */

export function PubCard({
  pub,
  rail = false,
  hideTopic = false,
  tagPostCount,
  clampDescription = false,
  noLink = false,
}: {
  pub: PublicationCard;
  rail?: boolean;
  /** Omit topic chips when the surrounding page already names the tag. */
  hideTopic?: boolean;
  /** Tagged-post tally for tag directory cards. */
  tagPostCount?: number;
  /** Cap the description at three lines (keeps preview grids tidy). */
  clampDescription?: boolean;
  /** Render body only (no stretched link) — for use inside a GridListItem. */
  noLink?: boolean;
}) {
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  return (
    <PublicationLink
      pub={pub}
      noLink={noLink}
      extraStyles={[styles.pubCard, rail && styles.pubCardRail]}
    >
      <Flex align="center" justify="between" style={styles.pubCardHead}>
        <PublicationAvatar pub={pub} size="lg" />
        <FollowSlot publicationUri={pub.uri} signedIn={signedIn} pub={pub} />
      </Flex>
      <span {...stylex.props(styles.pubCardName)}>{pub.name}</span>
      {pub.ownerHandle ? (
        <OwnerHandleLink did={pub.did} handle={pub.ownerHandle} />
      ) : null}
      {pub.description ? (
        <p
          dir="auto"
          {...stylex.props(
            styles.pubCardDesc,
            clampDescription && styles.pubCardDescClamp,
          )}
        >
          {pub.description}
        </p>
      ) : (
        <div aria-hidden {...stylex.props(styles.pubCardGrow)} />
      )}
      <PubCardFoot
        pub={pub}
        hideTopic={hideTopic}
        tagPostCount={tagPostCount}
      />
    </PublicationLink>
  );
}

/** @deprecated Use {@link PubCard} with `rail` */
export function PubRailCard({ pub }: { pub: PublicationCard }) {
  return <PubCard pub={pub} rail />;
}

/** @deprecated Use {@link PubCard} */
export function PubGridCard({ pub }: { pub: PublicationCard }) {
  return <PubCard pub={pub} />;
}

/* ── Compact modal row (Add publication) ─────────────────────────────────── */

export function ModalPubRow({
  pub,
  signedIn,
  isLast = false,
  onNavigate,
}: {
  pub: PublicationCard;
  signedIn: boolean;
  isLast?: boolean;
  onNavigate?: () => void;
}) {
  const metaParts: Array<string> = [];
  if (pub.ownerHandle) {
    metaParts.push(`@${pub.ownerHandle}`);
  }
  if (pub.topic) {
    metaParts.push(pub.topic);
  }

  return (
    <div
      {...stylex.props(styles.modalPubRow, isLast && styles.modalPubRowLast)}
    >
      <PublicationLink
        pub={pub}
        extraStyles={[styles.modalPubRowLink]}
        onNavigate={onNavigate}
      >
        <PublicationAvatar pub={pub} size="lg" />
        <Flex direction="column" gap="xs" style={styles.grow}>
          <span {...stylex.props(styles.modalPubName)}>{pub.name}</span>
          {metaParts.length > 0 ? (
            <span {...stylex.props(styles.modalPubMeta)}>
              {metaParts.map((part, index) => (
                <span key={part}>
                  {index > 0 ? <span aria-hidden> · </span> : null}
                  <span {...stylex.props(styles.bidiIsolate)}>{part}</span>
                </span>
              ))}
            </span>
          ) : null}
        </Flex>
      </PublicationLink>
      <FollowSlot publicationUri={pub.uri} signedIn={signedIn} pub={pub} />
    </div>
  );
}

/* ── Publication directory row (list / trending) ────────────────────────── */

export function PubDirectoryRow({
  pub,
  rank,
  isLast = false,
  isFirstInSection = false,
  hideTopic = false,
  tagPostCount,
  noLink = false,
  markHidden = false,
}: {
  pub: PublicationCard;
  rank?: number;
  isLast?: boolean;
  /** Drop top padding when the section head already provides spacing above. */
  isFirstInSection?: boolean;
  /** Omit topic chips when the surrounding page already names the tag. */
  hideTopic?: boolean;
  /** Tagged-post tally for tag directory rows. */
  tagPostCount?: number;
  /** Render body only (no stretched link) — for use inside a GridListItem. */
  noLink?: boolean;
  /**
   * Opt in to the dimmed "hidden from discovery" treatment for opted-out pubs.
   * Only the owner's own profile Publications tab sets this — elsewhere a hidden
   * pub the reader deliberately subscribed to (sidebar, lists, subscriptions
   * tab) must render normally even though its `hiddenFromDiscover` flag is set.
   */
  markHidden?: boolean;
}) {
  const { t } = useLingui();
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const hasRank = rank != null;
  // `hiddenFromDiscover` rides on every card, but the muted treatment only
  // applies where the caller opts in (the owner's own Publications tab).
  const isHidden = markHidden && pub.hiddenFromDiscover;

  return (
    <PublicationLink
      pub={pub}
      noLink={noLink}
      extraStyles={[
        styles.pubDirRow,
        hasRank && styles.pubDirRowRanked,
        isLast && styles.pubDirRowLast,
        isFirstInSection && styles.pubDirRowFirstInSection,
      ]}
    >
      {hasRank ? (
        <span {...stylex.props(styles.pubDirRank)}>
          {String(rank).padStart(2, "0")}
        </span>
      ) : null}
      <PublicationAvatar
        pub={pub}
        size="lg"
        style={[
          styles.pubDirAvatar,
          hasRank && styles.pubDirAvatarRanked,
          isHidden && styles.pubDirDimmed,
        ]}
      />
      <Flex direction="column" gap="sm" style={styles.pubDirMain}>
        <div
          {...stylex.props(styles.pubDirTop, hasRank && styles.pubDirTopRanked)}
        >
          {pub.searchNameHtml && tsHeadlineHasMatch(pub.searchNameHtml) ? (
            <SearchHeadline
              html={pub.searchNameHtml}
              style={[styles.pubDirName, isHidden && styles.pubDirDimmed]}
            />
          ) : (
            <span
              {...stylex.props(
                styles.pubDirName,
                isHidden && styles.pubDirDimmed,
              )}
            >
              {pub.name}
            </span>
          )}
          {pub.ownerHandle ? (
            <OwnerHandleLink
              did={pub.did}
              handle={pub.ownerHandle}
              style={styles.pubDirHandle}
            />
          ) : null}
          {isHidden ? (
            <span
              {...stylex.props(styles.pubHiddenBadge)}
              title={t`This publication opted out of discovery, so it's hidden everywhere except here on your own profile.`}
            >
              <EyeOff size={12} aria-hidden />
              <Trans>Hidden from discovery</Trans>
            </span>
          ) : null}
        </div>
        {pub.description ||
        pub.searchSnippetHtml ||
        (!hideTopic && pub.topic) ||
        tagPostCount != null ||
        pub.subscriberCount > 0 ||
        (tagPostCount == null && pub.documentCount > 0) ? (
          <div
            {...stylex.props(
              styles.pubDirExtra,
              hasRank && styles.pubDirExtraRanked,
              isHidden && styles.pubDirDimmed,
            )}
          >
            {pub.searchSnippetHtml ? (
              <SearchHeadline
                html={pub.searchSnippetHtml}
                style={styles.pubDirDesc}
              />
            ) : pub.description ? (
              <p dir="auto" {...stylex.props(styles.pubDirDesc)}>
                {pub.description}
              </p>
            ) : null}
            <PubDirectoryStats
              pub={pub}
              hideTopic={hideTopic}
              tagPostCount={tagPostCount}
            />
          </div>
        ) : null}
      </Flex>
      <FollowSlot
        publicationUri={pub.uri}
        signedIn={signedIn}
        pub={pub}
        style={[styles.pubDirFollow, hasRank && styles.pubDirFollowRanked]}
      />
    </PublicationLink>
  );
}

/** Readership + publication tally for a {@link FriendPersonRow}. */
function FriendPersonStats({ person }: { person: FriendPerson }) {
  const { i18n } = useLingui();
  const stats: Array<string> = [];
  if (person.subscriberCount > 0) {
    stats.push(
      i18n._(
        msg`${plural(person.subscriberCount, { one: "# reader", other: `${formatReaders(person.subscriberCount)} readers` })}`,
      ),
    );
  }
  stats.push(
    i18n._(
      msg`${plural(person.publicationCount, { one: "# publication", other: `${formatReaders(person.publicationCount)} publications` })}`,
    ),
  );

  return (
    <MetaLine>
      <MetaGroup>
        <Handle>
          {stats.map((part, index) => (
            <span key={part}>
              {index > 0 ? <span aria-hidden> · </span> : null}
              {/* Each stat is its own bidi run (digits + a localized word);
                  isolate so an RTL UI can't interleave them. */}
              <span {...stylex.props(styles.bidiIsolate)}>{part}</span>
            </span>
          ))}
        </Handle>
      </MetaGroup>
    </MetaLine>
  );
}

/** Stretched overlay link to a writer's profile — mirrors {@link PublicationStretchedLink}. */
function PersonStretchedLink({ did, name }: { did: string; name: string }) {
  return (
    <Link
      to="/u/$did"
      params={{ did }}
      aria-label={`Open ${name}`}
      {...stylex.props(styles.cardOverlay)}
    />
  );
}

/**
 * A single writer on the People tab of `/friends`: someone the reader follows
 * on Bluesky who publishes here. The row links to the writer's profile; the CTA
 * follows the *person* (`app.standard-reader.graph.follow`), not one of their
 * publications, so it reuses {@link FollowUserButton} rather than the
 * publication {@link FollowButton}.
 */
export function FriendPersonRow({
  person,
  isLast = false,
  isFirstInSection = false,
}: {
  person: FriendPerson;
  isLast?: boolean;
  /** Drop top padding when the section head already provides spacing above. */
  isFirstInSection?: boolean;
}) {
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const name =
    person.displayName?.trim() ||
    (person.handle ? `@${person.handle}` : "Unknown");
  const publications = person.publicationNames.slice(0, 3).join(", ");

  return (
    <div
      {...stylex.props(
        styles.cardShell,
        styles.pubDirRow,
        isLast && styles.pubDirRowLast,
        isFirstInSection && styles.pubDirRowFirstInSection,
      )}
    >
      <PersonStretchedLink did={person.did} name={name} />
      <div {...stylex.props(styles.cardInertRoot)}>
        <PublicationAvatar
          pub={{ name, iconUrl: null, ownerAvatarUrl: person.avatarUrl }}
          size="lg"
          style={styles.pubDirAvatar}
        />
        <Flex direction="column" gap="sm" style={styles.pubDirMain}>
          <div {...stylex.props(styles.pubDirTop)}>
            <span {...stylex.props(styles.pubDirName)}>{name}</span>
            {person.handle ? (
              <OwnerHandleLink
                did={person.did}
                handle={person.handle}
                style={styles.pubDirHandle}
              />
            ) : null}
          </div>
          <div {...stylex.props(styles.pubDirExtra)}>
            {publications ? (
              <p dir="auto" {...stylex.props(styles.pubDirDesc)}>
                {publications}
              </p>
            ) : null}
            <FriendPersonStats person={person} />
          </div>
        </Flex>
      </div>
      <div
        role="presentation"
        {...stylex.props(
          styles.followSlot,
          styles.cardInteractive,
          styles.pubDirFollow,
        )}
      >
        <FollowUserButton
          did={person.did}
          signedIn={signedIn}
          size="sm"
          user={{
            did: person.did,
            handle: person.handle,
            displayName: person.displayName,
            avatarUrl: person.avatarUrl,
          }}
        />
      </div>
    </div>
  );
}

export function PubCardSkeleton() {
  return (
    <div aria-hidden {...stylex.props(styles.pubCard, styles.pubCardSkeleton)}>
      <Flex align="center" justify="between" style={styles.pubCardHead}>
        <Skeleton variant="circle" size="lg" />
        <Skeleton
          variant="rectangle"
          height={spacing["8"]}
          width={spacing["20"]}
        />
      </Flex>
      <Skeleton variant="rectangle" height={spacing["6"]} width="72%" />
      <Skeleton
        variant="rectangle"
        height={spacing["4"]}
        width="38%"
        style={styles.pubCardSkeletonHandle}
      />
      <Skeleton
        variant="rectangle"
        height={spacing["5"]}
        width="100%"
        style={styles.pubCardSkeletonDesc}
      />
      <div {...stylex.props(styles.pubCardFootWrap)}>
        <Flex
          align="center"
          justify="between"
          gap="md"
          style={styles.pubCardFoot}
        >
          <Skeleton
            variant="rectangle"
            height={spacing["4"]}
            width={spacing["16"]}
          />
          <Skeleton
            variant="rectangle"
            height={spacing["4"]}
            width={spacing["14"]}
          />
        </Flex>
      </div>
    </div>
  );
}

export function PubDirectoryRowSkeleton({
  isLast = false,
  isFirstInSection = false,
}: {
  isLast?: boolean;
  isFirstInSection?: boolean;
}) {
  return (
    <div
      aria-hidden
      {...stylex.props(
        styles.pubDirRow,
        isLast && styles.pubDirRowLast,
        isFirstInSection && styles.pubDirRowFirstInSection,
        styles.pubDirRowSkeleton,
      )}
    >
      <Skeleton variant="circle" size="lg" style={styles.pubDirAvatar} />
      <Flex direction="column" gap="sm" style={styles.pubDirMain}>
        <Skeleton
          variant="rectangle"
          height={spacing["5"]}
          width="42%"
          style={styles.pubDirTop}
        />
        <div {...stylex.props(styles.pubDirExtra)}>
          <Skeleton variant="rectangle" height={spacing["4"]} width="100%" />
          <Skeleton variant="rectangle" height={spacing["3.5"]} width="34%" />
        </div>
      </Flex>
      <Skeleton
        variant="rectangle"
        height={spacing["8"]}
        width={spacing["20"]}
        style={styles.pubDirFollow}
      />
    </div>
  );
}
