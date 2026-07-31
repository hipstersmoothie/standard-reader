"use client";

import { Plural, useLingui } from "@lingui/react/macro";
import {
  AspectRatio,
  AspectRatioImage,
} from "@standard-reader/design-system/aspect-ratio";
import { Flex } from "@standard-reader/design-system/flex";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { animationDuration } from "@standard-reader/design-system/theme/animations.stylex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
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
import { Link } from "@tanstack/react-router";

import type { ComicShelfIssue } from "#/server/reader/comic";

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
  meta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: "0.7rem",
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.wide,
    textTransform: "uppercase",
  },
});

function ComicShelfCard({ issue }: { issue: ComicShelfIssue }) {
  const { t } = useLingui();
  return (
    <Link
      to="/comic/$did/$rkey"
      params={{ did: issue.did, rkey: issue.rkey }}
      // The cover art isn't always the issue's first page, so the page is named
      // explicitly rather than left to the anchor document's own offset.
      search={{ page: issue.pageOffset + 1 }}
      aria-label={t`Read ${issue.label}`}
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
        <span {...stylex.props(styles.label)}>{issue.label}</span>
        <span {...stylex.props(styles.meta)}>
          <Plural value={issue.pageCount} one="# page" other="# pages" />
        </span>
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
 * A comic publication's issues, as covers on a shelf.
 *
 * A comic posts one page per document, so its archive is a long list of
 * near-identical rows — `#1 Cover`, `#1, Pg. 1`, `#1, Pg. 2` — when what a
 * reader wants to browse is issues. This collapses those pages back into the
 * issues they came from and shows the art instead of the titles.
 *
 * The caller decides whether a shelf is warranted (`ComicShelf.grouped`); this
 * only draws it.
 */
export function ComicShelf({ issues }: { issues: Array<ComicShelfIssue> }) {
  return (
    <div {...stylex.props(styles.shelf)}>
      {issues.map((issue) => (
        <ComicShelfCard key={issue.uri} issue={issue} />
      ))}
    </div>
  );
}
