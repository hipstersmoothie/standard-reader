"use client";

import type { FollowStatus } from "#/integrations/tanstack-query/api-reader.functions";

import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createLink } from "@tanstack/react-router";
import { gap } from "#/design-system/theme/semantic-spacing.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex.tsx";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { parseInternalRoute } from "#/lib/internal-route";
import { ArrowRight, Check, Plus } from "lucide-react";
import { Fragment } from "react";

import type {
  ArticleCard,
  PublicationCard,
} from "../../integrations/tanstack-query/api-shapes";

import {
  AspectRatio,
  AspectRatioImage,
} from "../../design-system/aspect-ratio";
import { Button } from "../../design-system/button";
import { Flex } from "../../design-system/flex";
import { Skeleton } from "../../design-system/skeleton";
import { animationDuration } from "../../design-system/theme/animations.stylex";
import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
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
import {
  applyFollowOptimisticUpdate,
  invalidateFollowQueries,
  rollbackFollowOptimisticUpdate,
} from "./follow-optimistic";
import {
  documentLinkParams,
  formatDate,
  formatReaders,
  publicationLinkParams,
} from "./format";
import {
  Handle,
  ArticleEngagement,
  MetaLine,
  PublicationAvatar,
  Topic,
} from "./primitives";

const ButtonLink = createLink(Button);

const styles = stylex.create({
  cardLink: {
    textDecoration: "none",
    color: "inherit",
    cursor: "pointer",
    display: "block",
  },
  byline: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  bylineName: {
    color: uiColor.text2,
  },
  bylineWhen: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
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
  rowNoMedia: {
    gridTemplateColumns: "1fr",
  },
  rowFirstInSection: {
    paddingTop: spacing["0"],
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
    marginLeft: `calc(-1 * ${spacing["4"]})`,
    marginRight: `calc(-1 * ${spacing["4"]})`,
    paddingLeft: spacing["4"],
    paddingRight: spacing["4"],
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
  unreadDotFeature: {
    marginTop: spacing["1.5"],
  },
  pubCard: {
    ":hover": {
      boxShadow: shadow.sm,
      transform: "translateY(-2px)",
    },
    borderColor: {
      default: uiColor.border1,
      ":hover": uiColor.border2,
    },
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.bgSubtle,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    scrollSnapAlign: "start",
    transitionDuration: animationDuration.fast,
    transitionProperty: {
      default: "border-color, box-shadow, transform",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    height: "100%",
    paddingBottom: spacing["5"],
    paddingLeft: spacing["5"],
    paddingRight: spacing["5"],
    paddingTop: spacing["5"],
  },
  pubCardRail: {
    alignSelf: "stretch",
    width: "300px",
  },
  pubCardHead: {
    marginBottom: spacing["3.5"],
    width: "100%",
  },
  pubCardName: {
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
    alignItems: "flex-start",
    columnGap: spacing["4"],
    display: "flex",
    rowGap: spacing["4"],
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
  },
  pubDirRowLast: {
    borderBottomWidth: 0,
  },
  pubDirRowFirstInSection: {
    paddingTop: spacing["0"],
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
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    paddingTop: spacing["3"],
    width: spacing["6"],
  },
  pubDirTop: {
    alignItems: "baseline",
    columnGap: spacing["2.5"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["2"],
  },
  pubDirName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  pubDirDesc: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["2"],
    marginTop: spacing["1"],
    maxWidth: "64ch",
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
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  modalPubMeta: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    letterSpacing: tracking.tight,
  },
});

/* ── Follow toggle ──────────────────────────────────────────────────────── */

export function FollowButton({
  publicationUri,
  signedIn,
  size = "sm",
  pub,
  initialFollowing,
}: {
  publicationUri: string;
  signedIn: boolean;
  size?: "sm" | "md";
  /** Publication card for optimistic sidebar updates when toggling follow. */
  pub?: PublicationCard;
  /** @deprecated Prefer letting the button read follow status from React Query. */
  initialFollowing?: boolean;
}) {
  const queryClient = useQueryClient();
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

  if (!signedIn) {
    return (
      <ButtonLink to="/login" variant="secondary" size={size}>
        <Plus size={15} /> Follow
      </ButtonLink>
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

  return (
    <Button
      variant={following ? "secondary" : "primary"}
      size={size}
      onPress={onPress}
    >
      {following ? <Check size={15} /> : <Plus size={15} />}
      {following ? "Following" : "Follow"}
    </Button>
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
  const date = formatDate(article.publishedAt);
  return (
    <Flex align="center" gap="md" wrap style={styles.byline}>
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
  const date = formatDate(publishedAt);
  if (!date) return null;
  return (
    <span {...stylex.props(styles.bylineWhen, styles.titleRowDate, style)}>
      {date}
    </span>
  );
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
        <Text style={[titleStyle, styles.titleInRow]}>{article.title}</Text>
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
        <Text style={[titleStyle, styles.titleInRow]}>{article.title}</Text>
      </Flex>
      <TitleRowDate publishedAt={article.publishedAt} style={dateStyle} />
    </Flex>
  );
}

function ArticleMetaLine({ article }: { article: ArticleCard }) {
  const hasEngagement = article.recommendCount > 0 || article.commentCount > 0;
  const topics = articleTopics(article);
  if (!hasEngagement && topics.length === 0) return null;

  return (
    <MetaLine>
      {hasEngagement ? (
        <ArticleEngagement
          recommendCount={article.recommendCount}
          commentCount={article.commentCount}
        />
      ) : null}
      {hasEngagement && topics.length > 0 ? (
        <span aria-hidden {...stylex.props(styles.metaDot)}>
          ·
        </span>
      ) : null}
      <TopicMeta article={article} />
    </MetaLine>
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
  const params = documentLinkParams(article.uri);
  const merged = stylex.props(styles.cardLink, ...extraStyles);
  if (params) {
    return (
      <Link to="/a/$did/$rkey" params={params} {...merged}>
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
      <a href={href} target="_blank" rel="noreferrer" {...merged}>
        {children}
      </a>
    );
  }
  return <div {...stylex.props(...extraStyles)}>{children}</div>;
}

function PublicationLink({
  pub,
  children,
  extraStyles = [],
  onNavigate,
}: {
  pub: PublicationCard;
  children: React.ReactNode;
  extraStyles?: Array<stylex.StyleXStyles | false | undefined>;
  onNavigate?: () => void;
}) {
  const params = publicationLinkParams(pub.uri);
  const merged = stylex.props(styles.cardLink, ...extraStyles);
  if (params) {
    return (
      <Link to="/p/$did/$rkey" params={params} onClick={onNavigate} {...merged}>
        {children}
      </Link>
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
          {...merged}
        >
          {children}
        </Link>
      );
    }
    if (internal) {
      return (
        <Link to={internal.to} onClick={onNavigate} {...merged}>
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={onNavigate}
        {...merged}
      >
        {children}
      </a>
    );
  }
  return <div {...stylex.props(...extraStyles)}>{children}</div>;
}

/** Cover for an article: only its own cover image (never the Bluesky banner). */
function coverImage(article: ArticleCard): string | null {
  return article.coverImageUrl ?? null;
}

/** Topic labels for an article: its own tags, else the publication topic. */
function articleTopics(article: ArticleCard): Array<string> {
  if (article.tags && article.tags.length > 0) {
    return article.tags.slice(0, 2);
  }
  return article.publicationTopic ? [article.publicationTopic] : [];
}

/** Renders topic chips inside a {@link MetaLine}. */
function TopicMeta({ article }: { article: ArticleCard }) {
  const topics = articleTopics(article);
  return (
    <>
      {topics.map((topic, index) => (
        <Fragment key={topic}>
          {index > 0 ? (
            <span aria-hidden {...stylex.props(styles.metaDot)}>
              ·
            </span>
          ) : null}
          <Topic name={topic} />
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
  return (
    <ArticleLink
      article={article}
      extraStyles={[styles.feature, !cover && styles.featureTextOnly]}
    >
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
        {showByline ? <Byline article={article} includeDate /> : null}
        <ArticleTitleRow
          article={article}
          showByline={showByline}
          unread={unread}
          titleStyle={styles.featureTitle}
          unreadDotStyle={styles.unreadDotFeature}
          dateStyle={showByline ? undefined : styles.titleRowDateFeature}
        />
        {article.description ? (
          <span {...stylex.props(styles.featureDek)}>
            {article.description}
          </span>
        ) : null}
        <ArticleMetaLine article={article} />
      </Flex>
    </ArticleLink>
  );
}

/* ── Article row (list) ─────────────────────────────────────────────────── */

export function ArticleRow({
  article,
  unread = false,
  showByline = true,
  isFirstInSection = false,
}: {
  article: ArticleCard;
  unread?: boolean;
  showByline?: boolean;
  /** Drop top padding when the section head already provides spacing above. */
  isFirstInSection?: boolean;
}) {
  const cover = coverImage(article);
  return (
    <ArticleLink
      article={article}
      extraStyles={[
        styles.row,
        !cover && styles.rowNoMedia,
        isFirstInSection && styles.rowFirstInSection,
      ]}
    >
      <Flex direction="column" gap="2xl">
        {showByline ? <Byline article={article} includeDate /> : null}
        <ArticleTitleRow
          article={article}
          showByline={showByline}
          unread={unread}
          titleStyle={styles.rowTitle}
          unreadDotStyle={styles.unreadDotRow}
        />
        {article.description ? (
          <span {...stylex.props(styles.rowDek)}>{article.description}</span>
        ) : null}
        <ArticleMetaLine article={article} />
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
    </ArticleLink>
  );
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
  return (
    <ArticleLink article={article} extraStyles={[styles.compactRow]}>
      <span {...stylex.props(styles.rank)}>
        {String(rank).padStart(2, "0")}
      </span>
      <Flex direction="column" gap="sm" style={styles.grow}>
        <span {...stylex.props(styles.compactTitle)}>{article.title}</span>
        <MetaLine>
          <span>{article.publicationName ?? "Unknown"}</span>
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
          {pub.ownerHandle ? <Handle>@{pub.ownerHandle}</Handle> : null}
          <PubMetaRow pub={pub} />
        </Flex>
        <ArrowRight
          aria-hidden
          size={15}
          {...stylex.props(styles.miniRowArrow)}
        />
      </Flex>
    </PublicationLink>
  );
}

/* ── Compact publication row with topic + readers (directory style) ─────── */

export function PubMetaRow({ pub }: { pub: PublicationCard }) {
  const readers =
    pub.subscriberCount > 0
      ? `${formatReaders(pub.subscriberCount)} readers`
      : pub.documentCount > 0
        ? `${formatReaders(pub.documentCount)} articles`
        : null;

  if (!pub.topic && !readers) {
    return null;
  }

  return (
    <MetaLine>
      <Topic name={pub.topic} />
      {readers ? <Handle>{readers}</Handle> : null}
    </MetaLine>
  );
}

function PubReadersMeta({ pub }: { pub: PublicationCard }) {
  if (pub.subscriberCount <= 0) return null;
  return <Handle>{formatReaders(pub.subscriberCount)} readers</Handle>;
}

function PubCardFoot({ pub }: { pub: PublicationCard }) {
  if (!pub.topic && pub.subscriberCount <= 0) return null;
  return (
    <div {...stylex.props(styles.pubCardFootWrap)}>
      <Flex
        align="center"
        justify="between"
        gap="md"
        style={styles.pubCardFoot}
      >
        <Topic name={pub.topic} />
        <PubReadersMeta pub={pub} />
      </Flex>
    </div>
  );
}

function FollowSlot({
  publicationUri,
  signedIn,
  pub,
}: {
  publicationUri: string;
  signedIn: boolean;
  pub?: PublicationCard;
}) {
  return (
    <div
      role="presentation"
      {...stylex.props(styles.followSlot)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => event.stopPropagation()}
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
}: {
  pub: PublicationCard;
  rail?: boolean;
}) {
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  return (
    <PublicationLink
      pub={pub}
      extraStyles={[styles.pubCard, rail && styles.pubCardRail]}
    >
      <Flex align="center" justify="between" style={styles.pubCardHead}>
        <PublicationAvatar pub={pub} size="lg" />
        <FollowSlot publicationUri={pub.uri} signedIn={signedIn} pub={pub} />
      </Flex>
      <span {...stylex.props(styles.pubCardName)}>{pub.name}</span>
      {pub.ownerHandle ? <Handle>@{pub.ownerHandle}</Handle> : null}
      {pub.description ? (
        <p {...stylex.props(styles.pubCardDesc)}>{pub.description}</p>
      ) : (
        <div aria-hidden {...stylex.props(styles.pubCardGrow)} />
      )}
      <PubCardFoot pub={pub} />
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
  const meta = metaParts.join(" · ");

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
          {meta ? (
            <span {...stylex.props(styles.modalPubMeta)}>{meta}</span>
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
}: {
  pub: PublicationCard;
  rank?: number;
  isLast?: boolean;
  /** Drop top padding when the section head already provides spacing above. */
  isFirstInSection?: boolean;
}) {
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  return (
    <PublicationLink
      pub={pub}
      extraStyles={[
        styles.pubDirRow,
        isLast && styles.pubDirRowLast,
        isFirstInSection && styles.pubDirRowFirstInSection,
      ]}
    >
      {rank == null ? null : (
        <span {...stylex.props(styles.pubDirRank)}>
          {String(rank).padStart(2, "0")}
        </span>
      )}
      <PublicationAvatar pub={pub} size="lg" />
      <Flex direction="column" gap="sm" style={styles.grow}>
        <div {...stylex.props(styles.pubDirTop)}>
          <span {...stylex.props(styles.pubDirName)}>{pub.name}</span>
          {pub.ownerHandle ? <Handle>@{pub.ownerHandle}</Handle> : null}
        </div>
        {pub.description ? (
          <p {...stylex.props(styles.pubDirDesc)}>{pub.description}</p>
        ) : null}
        <MetaLine>
          <Topic name={pub.topic} />
          <PubReadersMeta pub={pub} />
          {pub.documentCount > 0 ? (
            <>
              {pub.subscriberCount > 0 ? (
                <span aria-hidden {...stylex.props(styles.metaDot)}>
                  ·
                </span>
              ) : null}
              <Handle>{formatReaders(pub.documentCount)} posts</Handle>
            </>
          ) : null}
        </MetaLine>
      </Flex>
      <FollowSlot publicationUri={pub.uri} signedIn={signedIn} pub={pub} />
    </PublicationLink>
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
      <Skeleton variant="circle" size="lg" />
      <Flex direction="column" gap="sm" style={styles.grow}>
        <Skeleton variant="rectangle" height={spacing["5"]} width="42%" />
        <Skeleton variant="rectangle" height={spacing["4"]} width="88%" />
        <Skeleton variant="rectangle" height={spacing["3.5"]} width="34%" />
      </Flex>
      <Skeleton
        variant="rectangle"
        height={spacing["8"]}
        width={spacing["20"]}
      />
    </div>
  );
}
