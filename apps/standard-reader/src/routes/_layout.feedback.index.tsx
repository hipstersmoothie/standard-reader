"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar } from "@standard-reader/design-system/avatar";
import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { Lightbox } from "@standard-reader/design-system/lightbox";
import { Link } from "@standard-reader/design-system/link";
import {
  Menu,
  MenuItem,
  MenuSection,
  MenuSectionHeader,
  MenuSeparator,
} from "@standard-reader/design-system/menu";
import { SearchField } from "@standard-reader/design-system/search-field";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@standard-reader/design-system/segmented-control";
import { Select, SelectItem } from "@standard-reader/design-system/select";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { amber } from "@standard-reader/design-system/theme/colors/amber.stylex";
import { blue } from "@standard-reader/design-system/theme/colors/blue.stylex";
import { green } from "@standard-reader/design-system/theme/colors/green.stylex";
import { red } from "@standard-reader/design-system/theme/colors/red.stylex";
import { mediaQueries } from "@standard-reader/design-system/theme/media-queries.stylex";
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
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowBigUp,
  ArrowUp,
  Bug,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  Lightbulb,
  List,
  MessageSquarePlus,
  RotateCcw,
  SlidersHorizontal,
  User,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { Selection } from "react-aria-components";

import { FeedbackDialog } from "#/components/feedback/feedback-dialog";
import { initials } from "#/components/reader/format";
import { ReaderContent } from "#/components/reader/primitives";
import { auth } from "#/integrations/tanstack-query/api-auth.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import type { UserinputDiscussion } from "#/integrations/tanstack-query/api-userinput.functions";
import { userinputApi } from "#/integrations/tanstack-query/api-userinput.functions";
import { isAtprotoScopeMissingError } from "#/lib/atproto/scope-error";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { useFormatters } from "#/lib/use-formatters";
import type { FeedbackTag } from "#/lib/userinput/space";
import { STANDARD_READER_FEEDBACK_TAGS } from "#/lib/userinput/space";
import { parseAtUri } from "#/server/atproto/uri";

export const Route = createFileRoute("/_layout/feedback/")({
  // Non-blocking: prefetch so the masthead below can render immediately (see
  // FeedbackPage) instead of the whole page waiting on this data. The
  // discussions list suspends on its own (see FeedbackDiscussions), showing
  // `DiscussionListSkeleton` while the prefetch is still in flight.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(
      userinputApi.getFeedbackDiscussionsQueryOptions({ limit: 50 }),
    );
  },
  head: () => ({
    meta: pageSocialMeta("feedback", getPublicUrlClient()),
  }),
  component: FeedbackPage,
  errorComponent: ({ error }) => (
    <Message>
      <Trans>
        Could not load feedback{" "}
        <span {...stylex.props(styles.mono)}>
          ({error instanceof Error ? "500" : "error"})
        </span>
        . Try again in a moment.
      </Trans>
    </Message>
  ),
});

const TAG_ICON: Record<FeedbackTag, React.ReactNode> = {
  bug: <Bug size={13} strokeWidth={2} />,
  feature: <Lightbulb size={13} strokeWidth={2} />,
  question: <HelpCircle size={13} strokeWidth={2} />,
};

const TAG_LABEL: Record<FeedbackTag, MessageDescriptor> = {
  bug: msg`Bug`,
  feature: msg`Feature request`,
  question: msg`Question`,
};

const TAG_SECTION: Record<FeedbackTag, MessageDescriptor> = {
  bug: msg`Bugs`,
  feature: msg`Feature requests`,
  question: msg`Questions`,
};

const styles = stylex.create({
  // ── Page ────────────────────────────────────────────────────────────
  // Constrain the feedback page to an article-reading column width so the
  // masthead, toolbar, and cards don't stretch the full ReaderContent
  // (1320px) container — matches the feel of an article page.
  page: {
    boxSizing: "border-box",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "46rem",
    width: "100%",
  },
  // ── Masthead ───────────────────────────────────────────────────────
  masthead: {
    alignItems: {
      default: "flex-start",
      "@media (min-width: 40rem)": "flex-end",
    },
    columnGap: gap["6xl"],
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 40rem)": "row",
    },
    justifyContent: "space-between",
    rowGap: gap["5xl"],
    borderBottomColor: uiColor.border2,
    borderBottomStyle: "solid",
    borderBottomWidth: 2,
    marginBottom: spacing["7"],
    paddingBottom: spacing["6"],
    paddingTop: {
      default: spacing["6"],
      "@media (min-width: 40rem)": spacing["10"],
    },
  },
  title: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: {
      default: "2.4rem",
      "@media (min-width: 48rem)": "3.6rem",
    },
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.none,
    marginInlineEnd: 0,
    marginInlineStart: 0,
    marginBottom: 0,
    marginTop: 0,
  },
  dek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    marginInlineEnd: 0,
    marginInlineStart: 0,
    marginBottom: 0,
    marginTop: 0,
    maxWidth: "54ch",
    paddingTop: spacing["3.5"],
  },
  dekLink: {
    color: uiColor.text2,
    textDecorationColor: uiColor.border2,
    textDecorationLine: "underline",
    textDecorationStyle: "solid",
    textDecorationThickness: "1.5px",
    textUnderlineOffset: "2px",
  },
  submitWrap: {
    flexShrink: 0,
    width: {
      default: "100%",
      "@media (min-width: 40rem)": "auto",
    },
  },
  submitButton: {
    justifyContent: {
      default: "center",
      "@media (min-width: 40rem)": "flex-start",
    },
    width: {
      default: "100%",
      "@media (min-width: 40rem)": "auto",
    },
  },

  // ── Toolbar ────────────────────────────────────────────────────────
  // One row at every width. Below 48rem it holds just the search field and
  // the overflow menu; above it the tag, sort, and toggle controls join the
  // same row inline (see `toolbarInline`). 48rem rather than 40rem because
  // the four inline controls squeeze the search field down to ~140px at
  // 40rem, clipping its placeholder.
  toolbar: {
    alignItems: "center",
    columnGap: gap.md,
    display: "flex",
    flexDirection: "row",
    rowGap: gap.md,
    marginBottom: spacing["8"],
  },
  toolbarSearch: {
    flexGrow: 1,
    minWidth: 0,
    width: "100%",
  },
  // The narrow-viewport entry point to every filter. Hidden once the controls
  // themselves fit on the row.
  toolbarOverflow: {
    display: {
      default: "flex",
      "@media (min-width: 48rem)": "none",
    },
    flexShrink: 0,
  },
  // `contents` so the controls inside lay out as direct children of the
  // toolbar row rather than as a nested flex box; `none` below 48rem takes
  // them out of the layout, the tab order, and the accessibility tree, since
  // the overflow menu drives the same state there.
  toolbarInline: {
    display: {
      default: "none",
      "@media (min-width: 48rem)": "contents",
    },
  },
  toolbarSelect: {
    flexShrink: 0,
    minWidth: spacing["48"],
  },
  toolbarSort: {
    flexShrink: 0,
  },
  toolbarToggle: {
    flexShrink: 0,
  },
  filterTrigger: {
    position: "relative",
  },
  // Marks the closed overflow trigger when a filter is hiding feedback, so a
  // filtered-down list never reads as an empty board. Drawn as a pseudo-element
  // rather than a child span: an extra element after the icon would match the
  // design-system button's `:has(svg+*)` padding rule (meant for icon+label
  // buttons) and pull the centred icon 4px off-centre.
  filterTriggerActive: {
    "::after": {
      borderRadius: radius.full,
      backgroundColor: primaryColor.solid1,
      content: "''",
      insetBlockStart: spacing["2"],
      insetInlineEnd: spacing["2"],
      position: "absolute",
      height: spacing["1.5"],
      width: spacing["1.5"],
    },
  },

  // ── List & sections ────────────────────────────────────────────────
  list: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap.md,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    rowGap: gap["3xl"],
    marginBottom: spacing["9"],
  },
  sectionLast: {
    marginBottom: 0,
  },
  groupHead: {
    alignItems: "center",
    columnGap: gap["2xl"],
    display: "flex",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    marginBottom: spacing["3.5"],
    paddingBottom: spacing["3"],
  },
  groupHeadTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    marginInlineEnd: 0,
    marginInlineStart: 0,
    marginBottom: 0,
    marginTop: 0,
  },
  groupHeadCount: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    marginInlineStart: "auto",
  },

  // ── Card ───────────────────────────────────────────────────────────
  card: {
    borderColor: {
      default: uiColor.border1,
      ":hover": uiColor.border2,
    },
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    backgroundColor: `light-dark(color-mix(in srgb, ${uiColor.bg} 90%, white), color-mix(in srgb, ${uiColor.bg} 90%, black))`,
    boxShadow: {
      default: shadow.sm,
      ":hover": shadow.lg,
    },
    display: "flex",
    flexDirection: "column",
    fontFamily: fontFamily.sans,
    paddingInlineEnd: horizontalSpace["5xl"],
    paddingInlineStart: horizontalSpace["5xl"],
    rowGap: gap["2xl"],
    transitionDuration: animationDuration.default,
    transitionProperty: "border-color, box-shadow",
    transitionTimingFunction: "ease-in-out",
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
    width: "100%",
  },
  cardHead: {
    alignItems: "flex-start",
    columnGap: gap["4xl"],
    display: "flex",
    justifyContent: "space-between",
  },
  cardTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    marginInlineEnd: 0,
    marginInlineStart: 0,
    marginBottom: 0,
    marginTop: 0,
    minWidth: 0,
  },
  headBadges: {
    flexShrink: 0,
  },
  tagPill: {
    borderRadius: radius.full,
    cornerShape: "squircle",
    alignItems: "center",
    columnGap: gap.xs,
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    paddingInlineEnd: horizontalSpace.lg,
    paddingInlineStart: horizontalSpace.md,
    whiteSpace: "nowrap",
    paddingBottom: verticalSpace.xs,
    paddingTop: verticalSpace.xs,
  },
  tagBug: {
    backgroundColor: red.component1,
    color: red.text2,
  },
  tagFeature: {
    backgroundColor: amber.component1,
    color: amber.text2,
  },
  tagQuestion: {
    backgroundColor: blue.component1,
    color: blue.text2,
  },
  tagImplemented: {
    backgroundColor: green.component1,
    color: green.text2,
  },
  cardBody: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.base,
    marginInlineEnd: 0,
    marginInlineStart: 0,
    // Feedback bodies routinely contain bare at:// and https:// URLs with no
    // break opportunity; without this they run past the card edge on mobile.
    overflowWrap: "anywhere",
    whiteSpace: "pre-line",
    marginBottom: 0,
    marginTop: 0,
  },
  attachments: {
    gap: gap.md,
    display: "flex",
    flexWrap: "wrap",
  },
  // Landscape framing, matching the composer: a square crop of a window
  // screenshot is a meaningless slice of chrome.
  attachmentButton: {
    borderColor: {
      default: uiColor.border1,
      ":is(:hover)": primaryColor.border3,
    },
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    overflow: "hidden",
    backgroundColor: uiColor.bgSubtle,
    cursor: "pointer",
    display: "block",
    outlineColor: primaryColor.solid1,
    outlineOffset: spacing["0.5"],
    outlineStyle: {
      default: "none",
      ":focus-visible": "solid",
    },
    outlineWidth: 2,
    paddingInlineEnd: 0,
    paddingInlineStart: 0,
    transitionDuration: {
      default: animationDuration.fast,
      [mediaQueries.reducedMotion]: "0s",
    },
    transitionProperty: "border-color",
    height: spacing["16"],
    paddingBottom: 0,
    paddingTop: 0,
    width: spacing["24"],
  },
  attachmentImage: {
    objectFit: "cover",
    height: "100%",
    width: "100%",
  },
  cardFoot: {
    alignItems: "center",
    columnGap: gap["3xl"],
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: gap["2xl"],
  },
  author: {
    alignItems: "center",
    columnGap: gap.sm,
    display: "flex",
    minWidth: 0,
  },
  authorName: {
    overflow: "hidden",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  authorNameAnon: {
    color: uiColor.text1,
    fontStyle: "italic",
  },
  dot: {
    color: uiColor.text1,
    flexShrink: 0,
    fontSize: fontSize.xs,
  },
  when: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
  },
  footRight: {
    alignItems: "center",
    columnGap: gap.xs,
    display: "flex",
    flexShrink: 0,
  },
  openLink: {
    borderRadius: radius.sm,
    cornerShape: "squircle",
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": uiColor.component1,
    },
    color: {
      default: uiColor.text1,
      ":hover": uiColor.text2,
    },
    columnGap: gap.xs,
    display: "inline-flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    paddingInlineEnd: horizontalSpace.sm,
    paddingInlineStart: horizontalSpace.sm,
    transitionDuration: animationDuration.default,
    transitionProperty: "background-color, color",
    transitionTimingFunction: "ease-in-out",
    paddingBottom: verticalSpace.xs,
    paddingTop: verticalSpace.xs,
    "::after": {
      display: "none",
    },
  },
  upvote: {
    borderColor: {
      default: uiColor.border1,
      ":hover": uiColor.border2,
    },
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      ":hover": primaryColor.component1,
    },
    boxShadow: shadow.xs,
    color: {
      default: uiColor.text1,
      ":hover": uiColor.text2,
    },
    columnGap: gap.xs,
    cursor: "pointer",
    display: "inline-flex",
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    paddingInlineEnd: horizontalSpace.md,
    paddingInlineStart: horizontalSpace.md,
    transitionDuration: animationDuration.default,
    transitionProperty: "background-color, border-color, color, transform",
    transitionTimingFunction: "ease-in-out",
    paddingBottom: verticalSpace.xs,
    paddingTop: verticalSpace.xs,
  },
  upvoteDisabled: {
    cursor: "default",
    opacity: 0.6,
  },
  upvoteActive: {
    borderColor: {
      default: primaryColor.border2,
      ":hover": primaryColor.border3,
    },
    backgroundColor: {
      default: primaryColor.component2,
      ":hover": primaryColor.component3,
    },
    color: primaryColor.text2,
  },
  upvoteIcon: {
    fill: "none",
    transitionDuration: animationDuration.default,
    transitionProperty: "transform",
    transitionTimingFunction: "ease-in-out",
  },
  upvoteIconActive: {
    fill: primaryColor.text2,
    color: primaryColor.text2,
    transform: "translateY(-1px)",
  },

  // ── Empty / error states ──────────────────────────────────────────
  message: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    paddingInlineEnd: spacing["5"],
    paddingInlineStart: spacing["5"],
    textAlign: "center",
    marginBottom: 0,
    marginTop: 0,
    maxWidth: "44ch",
    paddingBottom: spacing["20"],
    paddingTop: spacing["20"],
  },
  messageEm: {
    color: uiColor.text2,
  },
  mono: {
    fontFamily: fontFamily.mono,
    fontStyle: "normal",
  },

  // ── Skeleton ───────────────────────────────────────────────────────
  skelCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    display: "flex",
    flexDirection: "column",
    paddingInlineEnd: horizontalSpace["5xl"],
    paddingInlineStart: horizontalSpace["5xl"],
    rowGap: gap["2xl"],
    paddingBottom: verticalSpace["3xl"],
    paddingTop: verticalSpace["3xl"],
  },
  skelHead: {
    alignItems: "center",
    columnGap: gap["4xl"],
    display: "flex",
    justifyContent: "space-between",
  },
  skelFoot: {
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    marginTop: spacing["3"],
  },
});

const TAG_PILL_STYLE: Record<FeedbackTag, stylex.StyleXStyles> = {
  bug: styles.tagBug,
  feature: styles.tagFeature,
  question: styles.tagQuestion,
};

function discussionLink(uri: string): string {
  // `app.userinput.discussion` records render on userinput.app under
  // /d/<did>/<rkey> — the SPA extracts just the DID and rkey from the
  // AT-URI (dropping the at:// prefix and collection) and uses them as
  // two path segments. e.g. at://did:plc:abc/app.userinput.discussion/xyz
  //   -> https://userinput.app/#/d/did:plc:abc/xyz
  const parsed = parseAtUri(uri);
  if (!parsed) return "https://userinput.app/#/";
  return `https://userinput.app/#/d/${parsed.did}/${parsed.rkey}`;
}

function tagFor(discussion: UserinputDiscussion): FeedbackTag {
  return (discussion.tags?.[0] ?? "feature") as FeedbackTag;
}

/**
 * Label for a discussion the space owner has marked "implemented" on
 * userinput.app. "Implemented" reads oddly for a question, so questions get
 * "Answered" instead. Returns `null` for every other status (or none).
 */
function implementedLabel(
  discussion: UserinputDiscussion,
): MessageDescriptor | null {
  if (discussion.status !== "implemented") return null;
  return tagFor(discussion) === "question" ? msg`Answered` : msg`Implemented`;
}

/**
 * Screenshot attachments on a discussion, as a thumbnail strip that opens the
 * shared `Lightbox`. Attachments are set at post time and never edited (see
 * `UserinputDiscussion.images`), so there's no update path to worry about here.
 */
function DiscussionAttachments({
  images,
  title,
}: {
  images: NonNullable<UserinputDiscussion["images"]>;
  title: string;
}) {
  const { t } = useLingui();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <>
      <div {...stylex.props(styles.attachments)}>
        {images.map((image, index) => {
          const alt = image.alt ?? t`Attachment ${index + 1} on “${title}”`;
          return (
            <button
              key={image.url}
              type="button"
              {...stylex.props(styles.attachmentButton)}
              aria-label={t`View ${alt}`}
              onClick={() => setOpenIndex(index)}
            >
              <img
                src={image.url}
                alt={alt}
                loading="lazy"
                {...stylex.props(styles.attachmentImage)}
              />
            </button>
          );
        })}
      </div>
      <Lightbox
        isOpen={openIndex !== null}
        onOpenChange={(open) => {
          if (!open) setOpenIndex(null);
        }}
        initialIndex={openIndex ?? 0}
        alt={t`Attachments on “${title}”`}
        images={images.map((image) => ({
          src: image.url,
          ...(image.alt ? { alt: image.alt } : {}),
        }))}
      />
    </>
  );
}

function DiscussionCard({
  discussion,
  signedIn,
  upvotedUris,
  serverUpvotedUris,
  onUpvote,
}: {
  discussion: UserinputDiscussion;
  signedIn: boolean;
  upvotedUris: Set<string>;
  serverUpvotedUris: Set<string>;
  onUpvote: (discussion: UserinputDiscussion) => void;
}) {
  const fmt = useFormatters();
  const { t, i18n } = useLingui();
  const tag = tagFor(discussion);
  const statusLabel = implementedLabel(discussion);
  const author = discussion.author;
  const isAnon = !author.displayName && !author.handle;
  const authorName = author.displayName ?? author.handle ?? t`Anonymous`;
  const upvoted = upvotedUris.has(discussion.uri);
  // `upvoteCount` is the network total from constellation, which already
  // includes the viewer's upvote when the server seeded `viewerUpvotedUris`.
  // Adjust only for optimistic state the server hasn't reconciled yet:
  //   - optimistic add (locally upvoted, not yet on server): +1
  //   - optimistic remove (locally removed, still on server): -1
  const serverUpvoted = serverUpvotedUris.has(discussion.uri);
  const isOptimisticAdd = upvoted && !serverUpvoted;
  const isOptimisticRemove = !upvoted && serverUpvoted;
  const count = Math.max(
    0,
    discussion.upvoteCount +
      (isOptimisticAdd ? 1 : 0) -
      (isOptimisticRemove ? 1 : 0),
  );
  const title = signedIn
    ? upvoted
      ? t`${plural(count, { one: "# upvote", other: "# upvotes" })} — click to undo`
      : t`${plural(count, { one: "# upvote", other: "# upvotes" })} — click to upvote`
    : t`${plural(count, { one: "# upvote", other: "# upvotes" })} — sign in to upvote`;
  return (
    <article {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.cardHead)}>
        <h3 {...stylex.props(styles.cardTitle)}>{discussion.title}</h3>
        <Flex align="center" gap="xs" style={styles.headBadges}>
          {statusLabel ? (
            <span {...stylex.props(styles.tagPill, styles.tagImplemented)}>
              <CheckCircle2 size={13} strokeWidth={2} />
              {i18n._(statusLabel)}
            </span>
          ) : (
            <span {...stylex.props(styles.tagPill, TAG_PILL_STYLE[tag])}>
              {TAG_ICON[tag]}
              {i18n._(TAG_LABEL[tag])}
            </span>
          )}
        </Flex>
      </div>
      {discussion.body ? (
        <p {...stylex.props(styles.cardBody)}>{discussion.body}</p>
      ) : null}
      {discussion.images?.length ? (
        <DiscussionAttachments
          images={discussion.images}
          title={discussion.title}
        />
      ) : null}
      <div {...stylex.props(styles.cardFoot)}>
        <Flex align="center" gap="sm" style={styles.author}>
          <Avatar
            size="sm"
            src={author.avatar ?? undefined}
            fallback={initials(authorName)}
            alt={authorName}
          />
          <span
            {...stylex.props(
              styles.authorName,
              isAnon && styles.authorNameAnon,
            )}
          >
            {authorName}
          </span>
          <span aria-hidden {...stylex.props(styles.dot)}>
            ·
          </span>
          <span {...stylex.props(styles.when)}>
            {fmt.relativeTime(discussion.createdAt)}
          </span>
        </Flex>
        <div {...stylex.props(styles.footRight)}>
          <Link
            href={discussionLink(discussion.uri)}
            target="_blank"
            rel="noopener noreferrer"
            style={styles.openLink}
          >
            <ExternalLink size={13} strokeWidth={2} /> <Trans>Open</Trans>
          </Link>
          <button
            type="button"
            {...stylex.props(
              styles.upvote,
              upvoted && styles.upvoteActive,
              !signedIn && styles.upvoteDisabled,
            )}
            title={title}
            aria-label={title}
            aria-pressed={upvoted}
            disabled={!signedIn}
            onClick={() => onUpvote(discussion)}
          >
            <ArrowBigUp
              size={14}
              strokeWidth={2}
              {...stylex.props(
                styles.upvoteIcon,
                upvoted && styles.upvoteIconActive,
              )}
              aria-hidden
            />
            {count}
          </button>
        </div>
      </div>
    </article>
  );
}

function DiscussionCardSkeleton() {
  return (
    <div {...stylex.props(styles.skelCard)} aria-hidden>
      <div {...stylex.props(styles.skelHead)}>
        <Skeleton variant="rectangle" height={spacing["4"]} width="62%" />
        <Skeleton
          variant="rectangle"
          height={spacing["6"]}
          width={spacing["20"]}
        />
      </div>
      <Flex direction="column" gap="md">
        <Skeleton variant="rectangle" height={spacing["3"]} width="100%" />
        <Skeleton variant="rectangle" height={spacing["3"]} width="84%" />
      </Flex>
      <div {...stylex.props(styles.skelFoot)}>
        <Flex align="center" gap="sm">
          <Skeleton variant="circle" size="sm" />
          <Skeleton
            variant="rectangle"
            height={spacing["3"]}
            width={spacing["32"]}
          />
        </Flex>
        <Skeleton
          variant="rectangle"
          height={spacing["6"]}
          width={spacing["14"]}
        />
      </div>
    </div>
  );
}

function DiscussionListSkeleton() {
  const { t } = useLingui();
  return (
    <div
      {...stylex.props(styles.list)}
      aria-busy="true"
      aria-label={t`Loading feedback`}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <DiscussionCardSkeleton key={i} />
      ))}
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <p {...stylex.props(styles.message)}>{children}</p>;
}

type SortMode = "top" | "new";

type TagFilter = FeedbackTag | "all";

const TAG_FILTER_OPTIONS: Array<{ id: TagFilter; label: MessageDescriptor }> = [
  { id: "all", label: msg`All` },
  { id: "bug", label: msg`Bugs` },
  { id: "feature", label: msg`Feature requests` },
  { id: "question", label: msg`Questions` },
];

const TAG_FILTER_ICON: Record<TagFilter, React.ReactNode> = {
  all: <List size={16} strokeWidth={2} />,
  bug: <Bug size={16} strokeWidth={2} />,
  feature: <Lightbulb size={16} strokeWidth={2} />,
  question: <HelpCircle size={16} strokeWidth={2} />,
};

const SORT_OPTIONS: Array<{
  id: SortMode;
  label: MessageDescriptor;
  icon: React.ReactNode;
}> = [
  { icon: <ArrowUp size={16} strokeWidth={2} />, id: "top", label: msg`Top` },
  { icon: <Clock size={16} strokeWidth={2} />, id: "new", label: msg`New` },
];

interface FilterControlsProps {
  tagFilter: TagFilter;
  onTagFilterChange: (next: TagFilter) => void;
  sortMode: SortMode;
  onSortModeChange: (next: SortMode) => void;
  onlyMine: boolean;
  onOnlyMineChange: (next: boolean) => void;
  hideImplemented: boolean;
  onHideImplementedChange: (next: boolean) => void;
  signedIn: boolean;
}

/**
 * The narrow-viewport home for every filter. Below 48rem the toolbar is just
 * the search field and this trigger — the tag select, sort control, and the
 * two toggles would otherwise stack into a column of orphaned controls (the
 * fixed-size `IconButton`s in particular can't honour the row's stretch, so
 * they landed as two unlabeled squares against the left edge).
 *
 * Selection lives on each `MenuSection`, so the sections read as one settings
 * sheet: pick a type, pick a sort, flip the toggles, all without the menu
 * closing between choices.
 */
function FeedbackFilterMenu({
  tagFilter,
  onTagFilterChange,
  sortMode,
  onSortModeChange,
  onlyMine,
  onOnlyMineChange,
  hideImplemented,
  onHideImplementedChange,
  signedIn,
}: FilterControlsProps) {
  const { t, i18n } = useLingui();
  // Only count the settings that *hide* feedback — sort reorders, and hiding
  // implemented items is the default, so neither earns the trigger's dot.
  const activeFilters = (tagFilter === "all" ? 0 : 1) + (onlyMine ? 1 : 0);
  const canReset =
    tagFilter !== "all" || sortMode !== "top" || onlyMine || !hideImplemented;
  const label =
    activeFilters === 0
      ? t`Filter and sort`
      : t`Filter and sort — ${plural(activeFilters, {
          one: "# filter active",
          other: "# filters active",
        })}`;

  const toggleKeys = new Set<string>();
  if (onlyMine) toggleKeys.add("mine");
  if (!hideImplemented) toggleKeys.add("implemented");

  const handleToggleChange = (keys: Selection) => {
    const selected =
      keys === "all"
        ? new Set(["mine", "implemented"])
        : new Set([...keys].map(String));
    if (signedIn) onOnlyMineChange(selected.has("mine"));
    onHideImplementedChange(!selected.has("implemented"));
  };

  return (
    <Menu
      placement="bottom end"
      trigger={
        <IconButton
          size="lg"
          variant="secondary"
          label={label}
          // `label` only feeds the tooltip (react-aria wires it as
          // `aria-describedby`, and only while open), so name the button
          // explicitly for assistive tech and touch users.
          aria-label={label}
          style={[
            styles.filterTrigger,
            activeFilters > 0 && styles.filterTriggerActive,
          ]}
        >
          <SlidersHorizontal size={16} strokeWidth={2} />
        </IconButton>
      }
    >
      <MenuSection
        selectionMode="single"
        disallowEmptySelection
        shouldCloseOnSelect={false}
        selectedKeys={new Set([tagFilter])}
        onSelectionChange={(keys) => {
          const next = keys === "all" ? undefined : [...keys][0];
          if (typeof next === "string") onTagFilterChange(next as TagFilter);
        }}
      >
        <MenuSectionHeader>
          <Trans>Type</Trans>
        </MenuSectionHeader>
        {TAG_FILTER_OPTIONS.map((opt) => (
          <MenuItem
            key={opt.id}
            id={opt.id}
            prefix={TAG_FILTER_ICON[opt.id]}
            textValue={i18n._(opt.label)}
          >
            {i18n._(opt.label)}
          </MenuItem>
        ))}
      </MenuSection>
      <MenuSeparator />
      <MenuSection
        selectionMode="single"
        disallowEmptySelection
        shouldCloseOnSelect={false}
        selectedKeys={new Set([sortMode])}
        onSelectionChange={(keys) => {
          const next = keys === "all" ? undefined : [...keys][0];
          if (typeof next === "string") onSortModeChange(next as SortMode);
        }}
      >
        <MenuSectionHeader>
          <Trans>Sort</Trans>
        </MenuSectionHeader>
        {SORT_OPTIONS.map((opt) => (
          <MenuItem
            key={opt.id}
            id={opt.id}
            prefix={opt.icon}
            textValue={i18n._(opt.label)}
          >
            {i18n._(opt.label)}
          </MenuItem>
        ))}
      </MenuSection>
      <MenuSeparator />
      <MenuSection
        selectionMode="multiple"
        selectedKeys={toggleKeys}
        onSelectionChange={handleToggleChange}
      >
        <MenuSectionHeader>
          <Trans>Filter</Trans>
        </MenuSectionHeader>
        {signedIn ? (
          <MenuItem
            id="mine"
            prefix={<User size={16} strokeWidth={2} />}
            textValue={t`Only mine`}
          >
            <Trans>Only mine</Trans>
          </MenuItem>
        ) : null}
        <MenuItem
          id="implemented"
          prefix={<CheckCircle2 size={16} strokeWidth={2} />}
          textValue={t`Show implemented`}
        >
          <Trans>Show implemented</Trans>
        </MenuItem>
      </MenuSection>
      {canReset ? <MenuSeparator /> : null}
      {canReset ? (
        <MenuItem
          prefix={<RotateCcw size={16} strokeWidth={2} />}
          textValue={t`Reset filters`}
          onAction={() => {
            onTagFilterChange("all");
            onSortModeChange("top");
            onOnlyMineChange(false);
            onHideImplementedChange(true);
          }}
        >
          <Trans>Reset filters</Trans>
        </MenuItem>
      ) : null}
    </Menu>
  );
}

/**
 * Everything the masthead doesn't need — the discussions query, filters, and
 * upvote logic. Split out so `FeedbackPage`'s header + submit button render
 * unconditionally instead of waiting on this data (see the route's
 * non-blocking loader).
 */
function FeedbackDiscussions({
  signedIn,
  viewerDid,
}: {
  signedIn: boolean;
  viewerDid: string | null;
}) {
  const { t, i18n } = useLingui();
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("top");
  const [search, setSearch] = useState("");
  // Hide discussions the space owner has marked "implemented" by default so the
  // list surfaces open feedback first; the toolbar toggle reveals them.
  const [hideImplemented, setHideImplemented] = useState(true);
  // Filter to just the viewer's own feedback so they can quickly find the bugs,
  // feature requests, and questions they've submitted. Only offered to signed-in
  // readers (a guest has no `viewerDid`, so nothing to match against).
  const [onlyMine, setOnlyMine] = useState(false);
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(
    userinputApi.getFeedbackDiscussionsQueryOptions({ limit: 50 }),
  );
  // Locally-tracked upvotes. Seeded from the server's `viewerUpvotedUris`
  // (the viewer's own `app.userinput.upvote` records, loaded in the same
  // round trip as the discussions) and extended with optimistic upvotes cast
  // in the current session. After a mutation settles we invalidate the
  // discussions query, which re-fetches `viewerUpvotedUris` and reconciles
  // the set with the network state below.
  const [upvotedUris, setUpvotedUris] = useState<Set<string>>(
    () => new Set(data.viewerUpvotedUris),
  );
  // Reconcile with the server whenever the query refetches (e.g. after
  // `invalidateQueries` in the mutation's `onSettled`). The fresh server
  // response includes any upvote just written, so this replaces local state
  // rather than merging — no risk of dropping an in-flight optimistic mark
  // since `onSettled` fires after the write succeeded.
  useEffect(() => {
    setUpvotedUris(new Set(data.viewerUpvotedUris));
  }, [data.viewerUpvotedUris]);
  // The server's view of the viewer's upvotes — used to detect optimistic-only
  // upvotes (locally upvoted but not yet in the server count) so the displayed
  // count doesn't double-count the viewer's already-included upvote.
  const serverUpvotedUris = useMemo(
    () => new Set(data.viewerUpvotedUris),
    [data.viewerUpvotedUris],
  );

  const discussionsQueryKey = userinputApi.getFeedbackDiscussionsQueryOptions({
    limit: 50,
  }).queryKey;

  const upvoteMutation = useMutation({
    mutationFn: async ({
      discussion,
      upvoted,
    }: {
      discussion: UserinputDiscussion;
      upvoted: boolean;
    }): Promise<{ authorizationUrl?: string }> => {
      // Removing an existing upvote — no scope upgrade needed (the viewer
      // already granted the scope to create it). Just delete the record.
      if (upvoted) {
        await userinputApi.deleteUserinputUpvote({
          data: {
            subjectUri: discussion.uri,
            ...(discussion.cid ? { subjectCid: discussion.cid } : {}),
          },
        });
        return {};
      }
      try {
        await userinputApi.createUserinputUpvote({
          data: {
            subjectUri: discussion.uri,
            ...(discussion.cid ? { subjectCid: discussion.cid } : {}),
          },
        });
        return {};
      } catch (error) {
        if (!isAtprotoScopeMissingError(error, "app.userinput.upvote")) {
          throw error;
        }
        // Scope missing — stash an upvote draft, then kick off the upgrade
        // flow. The landing page consumes the draft and creates the upvote
        // record after OAuth completes.
        const draft = await userinputApi.createUpvoteDraft({
          data: { subjectUri: discussion.uri },
        });
        const result = await auth.upgradeToUserinputFeedback({
          data: { redirect: `/feedback/return?upvote=${draft.id}` },
        });
        return { authorizationUrl: result.authorizationUrl };
      }
    },
    onMutate: ({ discussion, upvoted }) => {
      // Optimistic: flip the local mark immediately so the button reflects the
      // click. The cache is left untouched — `discussion.upvoteCount` is the
      // network value and the card adjusts the count for optimistic state.
      setUpvotedUris((prev) => {
        const next = new Set(prev);
        if (upvoted) {
          next.delete(discussion.uri);
        } else {
          next.add(discussion.uri);
        }
        return next;
      });
    },
    onSuccess: (result) => {
      if (result.authorizationUrl) {
        globalThis.location.href = result.authorizationUrl;
      }
    },
    onError: (_error, { discussion, upvoted }) => {
      // Roll back the optimistic flip.
      setUpvotedUris((prev) => {
        const next = new Set(prev);
        if (upvoted) {
          next.add(discussion.uri);
        } else {
          next.delete(discussion.uri);
        }
        return next;
      });
    },
    onSettled: () => {
      // Refetch so the network upvote count + viewer upvoted set reconcile.
      void queryClient.invalidateQueries({ queryKey: discussionsQueryKey });
    },
  });

  const handleToggleUpvote = (discussion: UserinputDiscussion) => {
    if (!signedIn) return;
    if (upvoteMutation.isPending) return;
    const upvoted = upvotedUris.has(discussion.uri);
    upvoteMutation.mutate({ discussion, upvoted });
  };

  const allDiscussions = data?.discussions ?? [];

  // Client-side filter + search + sort. All cheap (tens of items), so no
  // need to round-trip to the server when the user toggles a control.
  const q = search.trim().toLowerCase();
  let discussions = allDiscussions;
  if (tagFilter !== "all") {
    discussions = discussions.filter((d) => tagFor(d) === tagFilter);
  }
  if (onlyMine && viewerDid) {
    discussions = discussions.filter((d) => d.author.did === viewerDid);
  }
  if (hideImplemented) {
    discussions = discussions.filter((d) => d.status !== "implemented");
  }
  if (q) {
    discussions = discussions.filter((d) => {
      return (
        d.title.toLowerCase().includes(q) ||
        (d.body?.toLowerCase().includes(q) ?? false) ||
        (d.author.displayName?.toLowerCase().includes(q) ?? false) ||
        (d.author.handle?.toLowerCase().includes(q) ?? false)
      );
    });
  }
  discussions = discussions.toSorted((a, b) => {
    if (sortMode === "top" && b.upvoteCount !== a.upvoteCount) {
      return b.upvoteCount - a.upvoteCount;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  // Group by tag only when no tag filter is active and no search is present
  // (the "browse all" view). With an active tag filter or search, show a
  // flat list — grouping a single filtered category is redundant.
  const grouped: Record<FeedbackTag, Array<UserinputDiscussion>> = {
    bug: [],
    feature: [],
    question: [],
  };
  const showGroups = tagFilter === "all" && !search;
  if (showGroups) {
    for (const d of discussions) {
      const tag = tagFor(d);
      if (tag in grouped) {
        grouped[tag].push(d);
      } else {
        grouped.feature.push(d);
      }
    }
  }

  let body: React.ReactNode;
  if (allDiscussions.length === 0) {
    body = (
      <Message>
        <Flex direction="column" gap="md">
          <span>
            <Trans>No feedback yet.</Trans>
          </span>
          <span {...stylex.props(styles.messageEm)}>
            <Trans>Be the first to share a bug, idea, or question.</Trans>
          </span>
        </Flex>
      </Message>
    );
  } else if (discussions.length === 0) {
    body =
      onlyMine && tagFilter === "all" && !search ? (
        <Message>
          <Flex direction="column" gap="md">
            <span>
              <Trans>You haven&apos;t submitted any feedback yet.</Trans>
            </span>
            <span {...stylex.props(styles.messageEm)}>
              <Trans>Share a bug, idea, or question to see it here.</Trans>
            </span>
          </Flex>
        </Message>
      ) : (
        <Message>
          <Trans>No feedback matches your filters.</Trans>
        </Message>
      );
  } else if (showGroups) {
    body = (
      <div {...stylex.props(styles.list)}>
        {STANDARD_READER_FEEDBACK_TAGS.map((option, i) => {
          const items = grouped[option.value];
          if (items.length === 0) return null;
          const isLast = i === STANDARD_READER_FEEDBACK_TAGS.length - 1;
          return (
            <section
              key={option.value}
              {...stylex.props(styles.section, isLast && styles.sectionLast)}
            >
              <div {...stylex.props(styles.groupHead)}>
                <h2 {...stylex.props(styles.groupHeadTitle)}>
                  {i18n._(TAG_SECTION[option.value])}
                </h2>
                <span {...stylex.props(styles.groupHeadCount)}>
                  {items.length}
                </span>
              </div>
              <div {...stylex.props(styles.list)}>
                {items.map((d) => (
                  <DiscussionCard
                    key={d.uri}
                    discussion={d}
                    signedIn={signedIn}
                    upvotedUris={upvotedUris}
                    serverUpvotedUris={serverUpvotedUris}
                    onUpvote={handleToggleUpvote}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  } else {
    body = (
      <div {...stylex.props(styles.list)}>
        {discussions.map((d) => (
          <DiscussionCard
            key={d.uri}
            discussion={d}
            signedIn={signedIn}
            upvotedUris={upvotedUris}
            serverUpvotedUris={serverUpvotedUris}
            onUpvote={handleToggleUpvote}
          />
        ))}
      </div>
    );
  }

  return (
    <>
      {allDiscussions.length === 0 ? null : (
        <div {...stylex.props(styles.toolbar)}>
          <SearchField
            aria-label={t`Search feedback`}
            placeholder={t`Search feedback...`}
            size="lg"
            variant="secondary"
            style={styles.toolbarSearch}
            value={search}
            onChange={setSearch}
          />
          <div {...stylex.props(styles.toolbarOverflow)}>
            <FeedbackFilterMenu
              tagFilter={tagFilter}
              onTagFilterChange={setTagFilter}
              sortMode={sortMode}
              onSortModeChange={setSortMode}
              onlyMine={onlyMine}
              onOnlyMineChange={setOnlyMine}
              hideImplemented={hideImplemented}
              onHideImplementedChange={setHideImplemented}
              signedIn={signedIn}
            />
          </div>
          <div {...stylex.props(styles.toolbarInline)}>
            <Select
              aria-label={t`Filter by tag`}
              size="lg"
              variant="secondary"
              selectedKey={tagFilter}
              style={styles.toolbarSelect}
              onSelectionChange={(key) => {
                if (key == null) return;
                setTagFilter(String(key) as TagFilter);
              }}
            >
              {TAG_FILTER_OPTIONS.map((opt) => (
                <SelectItem
                  key={opt.id}
                  id={opt.id}
                  textValue={i18n._(opt.label)}
                >
                  {i18n._(opt.label)}
                </SelectItem>
              ))}
            </Select>
            <SegmentedControl
              aria-label={t`Sort by`}
              size="lg"
              style={styles.toolbarSort}
              selectedKeys={new Set([sortMode])}
              onSelectionChange={(keys) => {
                const next = [...keys][0];
                if (typeof next === "string") {
                  setSortMode(next as SortMode);
                }
              }}
            >
              <SegmentedControlItem key="top" id="top">
                <ArrowUp size={13} strokeWidth={2} /> <Trans>Top</Trans>
              </SegmentedControlItem>
              <SegmentedControlItem key="new" id="new">
                <Trans>New</Trans>
              </SegmentedControlItem>
            </SegmentedControl>
            {signedIn ? (
              <IconButton
                size="lg"
                variant={onlyMine ? "primary" : "secondary"}
                label={onlyMine ? t`Show all feedback` : t`Show only mine`}
                style={styles.toolbarToggle}
                aria-pressed={onlyMine}
                onPress={() => setOnlyMine((v) => !v)}
              >
                <User size={16} strokeWidth={2} />
              </IconButton>
            ) : null}
            <IconButton
              size="lg"
              variant="secondary"
              label={
                hideImplemented ? t`Show implemented` : t`Hide implemented`
              }
              style={styles.toolbarToggle}
              onPress={() => setHideImplemented((v) => !v)}
            >
              {hideImplemented ? (
                <EyeOff size={16} strokeWidth={2} />
              ) : (
                <Eye size={16} strokeWidth={2} />
              )}
            </IconButton>
          </div>
        </div>
      )}

      {body}
    </>
  );
}

function FeedbackPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const viewerDid = session?.user?.did ?? null;

  return (
    <ReaderContent>
      <div {...stylex.props(styles.page)}>
        <header {...stylex.props(styles.masthead)}>
          <div>
            <h1 {...stylex.props(styles.title)}>
              <Trans>Feedback</Trans>
            </h1>
            <p {...stylex.props(styles.dek)}>
              <Trans>
                Bug reports, feature requests, and questions for Standard
                Reader. Feedback lives on{" "}
                <Link
                  href="https://userinput.app/#/s/did:plc:f4os2wz5fjl56xpwcvtnqu7m/3mprrc56lgd2e"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={styles.dekLink}
                >
                  userinput.app
                </Link>
                .
              </Trans>
            </p>
          </div>
          {signedIn ? (
            <div {...stylex.props(styles.submitWrap)}>
              <Button
                variant="primary"
                size="lg"
                onPress={() => setDialogOpen(true)}
                style={styles.submitButton}
              >
                <MessageSquarePlus size={16} strokeWidth={2} />{" "}
                <Trans>Submit feedback</Trans>
              </Button>
            </div>
          ) : null}
        </header>

        <Suspense fallback={<DiscussionListSkeleton />}>
          <FeedbackDiscussions signedIn={signedIn} viewerDid={viewerDid} />
        </Suspense>
      </div>

      {signedIn ? (
        <FeedbackDialog isOpen={dialogOpen} onOpenChange={setDialogOpen} />
      ) : null}
    </ReaderContent>
  );
}
