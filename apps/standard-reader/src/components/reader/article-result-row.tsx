"use client";

import { Avatar } from "@standard-reader/design-system/avatar";
import { Flex } from "@standard-reader/design-system/flex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";

import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";
import { useFormatters } from "#/lib/use-formatters";

import { useEngagementCountsVisible } from "./engagement-visibility";
import { formatReadingTime, initials } from "./format";
import { ArticleEngagement } from "./primitives";

const DEK_MAX = 200;

const styles = stylex.create({
  cover: {
    borderRadius: radius.md,
    backgroundColor: uiColor.component1,
    flexShrink: 0,
    objectFit: "cover",
    height: "3.5rem",
    width: "3.5rem",
  },
  body: {
    minWidth: 0,
  },
  title: {
    // Single-line NAME/TITLE in a UI row: isolate for correct character
    // ordering, but let alignment follow the surrounding UI (right under
    // RTL). `dir="auto"` here would left-align it and break the column.
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
  bylineText: {
    overflow: "hidden",
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Keeps a Latin/numeric run (handle, relative date) from being reordered by
  // the bidi algorithm when it shares a line with RTL UI text.
  bidiIsolate: {
    unicodeBidi: "isolate",
  },
  byName: {
    // Single-line NAME/TITLE in a UI row: isolate for correct character
    // ordering, but let alignment follow the surrounding UI (right under
    // RTL). `dir="auto"` here would left-align it and break the column.
    unicodeBidi: "isolate",
    color: uiColor.text2,
    fontWeight: fontWeight.semibold,
  },
  feedByline: {
    marginBottom: "0.15rem",
  },
  meta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  dot: {
    color: uiColor.text1,
  },
  // ── Feed variant ──
  feedBody: {
    flexGrow: 1,
    minWidth: 0,
  },
  feedTitle: {
    // Single-line NAME/TITLE in a UI row: isolate for correct character
    // ordering, but let alignment follow the surrounding UI (right under
    // RTL). `dir="auto"` here would left-align it and break the column.
    unicodeBidi: "isolate",
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.xs,
  },
  feedDek: {
    // Single-line NAME/TITLE in a UI row: isolate for correct character
    // ordering, but let alignment follow the surrounding UI (right under
    // RTL). `dir="auto"` here would left-align it and break the column.
    unicodeBidi: "isolate",
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.sm,
  },
  feedCover: {
    borderRadius: radius.md,
    backgroundColor: uiColor.component1,
    flexShrink: 0,
    objectFit: "cover",
    height: "4.25rem",
    width: "4.25rem",
  },
});

/** Publication name (emphasized) · @handle · age. */
function Byline({
  article,
  when,
  style,
}: {
  article: ArticleCard;
  when?: string;
  style?: stylex.StyleXStyles;
}) {
  const name = article.publicationName ?? article.publicationOwnerHandle;
  if (!name) return null;
  const handle =
    article.publicationName && article.publicationOwnerHandle
      ? `@${article.publicationOwnerHandle}`
      : null;
  return (
    <Flex align="center" gap="sm" style={style}>
      <Avatar
        size="sm"
        src={
          article.publicationIconUrl ??
          article.publicationOwnerAvatarUrl ??
          undefined
        }
        fallback={initials(name)}
        alt=""
      />
      <span {...stylex.props(styles.bylineText)}>
        <span {...stylex.props(styles.byName)}>{name}</span>
        {handle ? (
          <>
            <span aria-hidden> · </span>
            <span {...stylex.props(styles.bidiIsolate)}>{handle}</span>
          </>
        ) : null}
        {when ? (
          <>
            <span aria-hidden> · </span>
            <span {...stylex.props(styles.bidiIsolate)}>{when}</span>
          </>
        ) : null}
      </span>
    </Flex>
  );
}

/** Dot-separated meta line: reading time, age, and engagement counts. */
function MetaLine({
  article,
  parts,
}: {
  article: ArticleCard;
  parts: Array<string>;
}) {
  const metricsVisible = useEngagementCountsVisible();
  const hasEngagement =
    metricsVisible && (article.recommendCount > 0 || article.commentCount > 0);
  if (parts.length === 0 && !hasEngagement) return null;

  return (
    <Flex align="center" gap="sm" wrap style={styles.meta}>
      {parts.map((part, index) => (
        <span key={part}>
          {index > 0 ? (
            <span aria-hidden {...stylex.props(styles.dot)}>
              {" · "}
            </span>
          ) : null}
          {part}
        </span>
      ))}
      {parts.length > 0 && hasEngagement ? (
        <span aria-hidden {...stylex.props(styles.dot)}>
          ·
        </span>
      ) : null}
      <ArticleEngagement
        recommendCount={article.recommendCount}
        commentCount={article.commentCount}
        size="xs"
        viewerHasRecommended={article.viewerHasRecommended}
      />
    </Flex>
  );
}

/**
 * A recognizable article row. `compact` (default) is a single-line thumbnail
 * row for tight pickers; `feed` mirrors the app's article lists with a large
 * serif title, dek, byline, and cover. Presentational only — no navigation.
 */
export function ArticleResultRow({
  article,
  variant = "compact",
}: {
  article: ArticleCard;
  variant?: "compact" | "feed";
}) {
  const fmt = useFormatters();
  const readingTime = formatReadingTime(article.textContent);
  const when = fmt.relativeTime(article.publishedAt);
  const coverUrl = article.coverImageUrl ?? article.publicationBannerUrl;

  if (variant === "feed") {
    const dek = article.description?.trim();
    const dekText =
      dek && dek.length > DEK_MAX ? `${dek.slice(0, DEK_MAX).trimEnd()}…` : dek;
    const metaParts = readingTime ? [readingTime] : [];

    return (
      <Flex align="start" gap="2xl">
        <Flex direction="column" gap="md" style={styles.feedBody}>
          <Byline article={article} when={when} style={styles.feedByline} />
          <span {...stylex.props(styles.feedTitle)}>{article.title}</span>
          {dekText ? (
            <span {...stylex.props(styles.feedDek)}>{dekText}</span>
          ) : null}
          <MetaLine article={article} parts={metaParts} />
        </Flex>
        {coverUrl ? (
          <img src={coverUrl} alt="" {...stylex.props(styles.feedCover)} />
        ) : null}
      </Flex>
    );
  }

  const metaParts: Array<string> = [];
  if (readingTime) metaParts.push(readingTime);
  if (when) metaParts.push(when);

  return (
    <Flex align="center" gap="lg">
      {coverUrl ? (
        <img src={coverUrl} alt="" {...stylex.props(styles.cover)} />
      ) : (
        <span aria-hidden {...stylex.props(styles.cover)} />
      )}
      <Flex direction="column" gap="xs" style={styles.body}>
        <span {...stylex.props(styles.title)}>{article.title}</span>
        <Byline article={article} />
        <MetaLine article={article} parts={metaParts} />
      </Flex>
    </Flex>
  );
}
