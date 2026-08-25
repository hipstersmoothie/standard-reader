"use client";

import { Plural, useLingui } from "@lingui/react/macro";
import {
  AspectRatio,
  AspectRatioImage,
} from "@standard-reader/design-system/aspect-ratio";
import { Flex } from "@standard-reader/design-system/flex";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import {
  primaryColor,
  uiColor,
} from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
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
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";

import { comicIssueProgress } from "#/lib/comic/shelf-progress";
import type { ArchiveOrder } from "#/lib/publication/archive-order";
import type { ComicShelfIssue, ComicUnreadPage } from "#/server/reader/comic";

import { isArticleUnreadForReader } from "../reader/read-optimistic";

/** Comic covers are taller than they are wide — the standard trade paperback. */
const COVER_ASPECT_RATIO = 2 / 3;
/** Enough to fill the grid at every breakpoint without a tall empty block. */
const SKELETON_COVERS = 4;

const styles = stylex.create({
  shelf: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@media (min-width: 40rem)": "repeat(3, minmax(0, 1fr))",
      "@media (min-width: 64rem)": "repeat(4, minmax(0, 1fr))",
    },
    columnGap: gap["5xl"],
    rowGap: gap["6xl"],
  },
  issue: {
    textDecoration: "none",
    color: "inherit",
    display: "flex",
    flexDirection: "column",
    rowGap: gap.xl,
  },
  cover: {
    backgroundColor: uiColor.component1,
    // The lift is what makes a cover read as something to pick up.
    transform: { default: "none", ":hover": "translateY(-2px)" },
    transitionDuration: animationDuration.fast,
    transitionProperty: "transform, box-shadow",
    borderColor: uiColor.border1,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: { default: shadow.sm, ":hover": shadow.md },
  },
  placeholder: {
    alignItems: "center",
    color: uiColor.text1,
    display: "flex",
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    inset: 0,
    justifyContent: "center",
    padding: spacing["4"],
    position: "absolute",
    textAlign: "center",
  },
  label: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    // A single-line label in a grid cell: order its own characters, but keep
    // the cell's alignment.
    unicodeBidi: "isolate",
    lineHeight: lineHeight.sm,
  },
  // Same mark, same size, same colour as an unread article row's — a comic
  // issue is one more thing the reader hasn't got to yet.
  unreadDot: {
    borderRadius: radius.full,
    backgroundColor: primaryColor.solid1,
    display: "inline-block",
    flexShrink: 0,
    height: "7px",
    marginTop: spacing["1.5"],
    width: "7px",
  },
  meta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.7rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
});

function ComicShelfCard({
  issue,
  isStillUnread,
}: {
  issue: ComicShelfIssue;
  isStillUnread: (page: ComicUnreadPage) => boolean;
}) {
  const { t } = useLingui();
  const { startPage, unread } = comicIssueProgress(issue, isStillUnread);
  return (
    <Link
      to="/comic/$did/$rkey"
      params={{ did: issue.did, rkey: issue.rkey }}
      // Where the reader left off, or the issue's own first page — either way
      // named explicitly, since the cover art isn't always the first page and
      // the anchor document's offset would land on it rather than on them.
      search={{ page: startPage }}
      aria-label={unread ? t`Continue ${issue.label}` : t`Read ${issue.label}`}
      {...stylex.props(styles.issue)}
    >
      <AspectRatio aspectRatio={COVER_ASPECT_RATIO} style={styles.cover}>
        {issue.coverImageUrl ? (
          <AspectRatioImage
            src={issue.coverImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          // No art to show, so the label carries the cover instead of leaving a
          // blank card. The link's own label already reads it out.
          <span aria-hidden {...stylex.props(styles.placeholder)}>
            {issue.label}
          </span>
        )}
      </AspectRatio>
      <Flex direction="column" gap="xs">
        <Flex gap="md" align="start">
          {unread ? (
            // The link's own label already says "Continue", so the dot is
            // decoration for anyone reading it out.
            <span aria-hidden {...stylex.props(styles.unreadDot)} />
          ) : null}
          <span {...stylex.props(styles.label)}>{issue.label}</span>
        </Flex>
        {/* How much reading a cover stands for. A one-page card is its own
            answer — on a shelf of pages every card would say "1 page", which
            tells the reader nothing they can't see. */}
        {issue.pageCount > 1 ? (
          <span {...stylex.props(styles.meta)}>
            <Plural value={issue.pageCount} one="# page" other="# pages" />
          </span>
        ) : null}
      </Flex>
    </Link>
  );
}

/**
 * Placeholder covers while the shelf loads.
 *
 * Deliberately off the perf ready chain (no `aria-busy`) — see the loading-UX
 * notes in CLAUDE.md: this sits below the hero and must not hold first paint.
 */
export function ComicShelfSkeleton() {
  return (
    <div aria-hidden {...stylex.props(styles.shelf)}>
      {Array.from({ length: SKELETON_COVERS }, (_, index) => (
        <Flex key={index} direction="column" gap="xl">
          <AspectRatio aspectRatio={COVER_ASPECT_RATIO} style={styles.cover}>
            <Skeleton variant="rectangle" height="100%" width="100%" />
          </AspectRatio>
          <Skeleton variant="rectangle" height={spacing["4"]} width="45%" />
        </Flex>
      ))}
    </div>
  );
}

/**
 * A comic publication's covers, on a shelf.
 *
 * A comic posts one page per document, so its archive is a long list of
 * near-identical rows — `#1 Cover`, `#1, Pg. 1`, `#1, Pg. 2` — when what a
 * reader wants to browse is art. The server decides what one cover stands for:
 * an issue when the titles number them, otherwise a single post
 * (`ComicShelf.mode`). This only draws whatever it was handed.
 *
 * `issues` always arrive in publication order (#1 first) — the spine reads that
 * way so absolute page numbers mean something. `order` is the reader's view of
 * the archive, and the shelf is the archive here, so it follows: the latest
 * issue leads unless the reader asked to start at the beginning.
 *
 * An issue is marked unread while any of its pages is, and its cover opens on
 * the first of those pages. The server's answer is corrected here with the
 * reads this session already knows about, which is what keeps a comic the reader
 * has just walked through from still wearing its dots on the way back out (see
 * `#/lib/comic/shelf-progress`).
 */
export function ComicShelf({
  issues,
  order,
  trackReading,
  signedIn,
}: {
  issues: Array<ComicShelfIssue>;
  order: ArchiveOrder;
  /** Whether the reader keeps reading history — no history, no unread state. */
  trackReading: boolean;
  signedIn: boolean;
}) {
  const queryClient = useQueryClient();
  const isStillUnread = useCallback(
    (page: ComicUnreadPage) =>
      // The server already said this page is unread; the cache is only ever
      // allowed to take that back, which is exactly what an article row does.
      isArticleUnreadForReader(
        queryClient,
        { uri: page.uri, isRead: false },
        { trackReading, signedIn },
      ),
    [queryClient, signedIn, trackReading],
  );

  const shelved = order === "newest" ? [...issues].toReversed() : issues;
  return (
    <div {...stylex.props(styles.shelf)}>
      {shelved.map((issue) => (
        <ComicShelfCard
          key={issue.uri}
          issue={issue}
          isStillUnread={isStillUnread}
        />
      ))}
    </div>
  );
}
