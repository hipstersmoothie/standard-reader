"use client";

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { AppLink } from "#/components/reader/app-link";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { parseInternalRoute } from "#/lib/internal-route";
import { usePageReader } from "#/lib/page-reader/page-reader-context";
import { buildBlueskyComposeUrl } from "#/lib/quote-share";
import {
  ArrowLeft,
  Bookmark,
  ExternalLink,
  Headphones,
  Heart,
  Share2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ArticleCard } from "../../integrations/tanstack-query/api-shapes";

import { Avatar } from "../../design-system/avatar";
import { Button } from "../../design-system/button";
import { Flex } from "../../design-system/flex";
import { IconButton } from "../../design-system/icon-button";
import { animationDuration } from "../../design-system/theme/animations.stylex";
import {
  criticalColor,
  primaryColor,
  uiColor,
} from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../../design-system/theme/typography.stylex";
import { FollowButton, MiniPubRow } from "./cards";
import { CommentsSection } from "./comments/comments-section";
import { ArticleContent } from "./content/article-content";
import {
  articleCardReadingText,
  articleReadingText,
  articleSpeechText,
} from "./content/extract-text";
import {
  articlePublicationUrl,
  documentLinkParams,
  formatArticleReadStats,
  formatDate,
  formatReaders,
  formatReadingTime,
  initials,
  publicationLinkParams,
  readingMinutes,
} from "./format";
import {
  ArticleEngagement,
  Handle,
  Kicker,
  PublicationAvatar,
  SectionHead,
  Topic,
} from "./primitives";
import { QuoteShareLayer } from "./quote-share-layer";
import { applyMarkReadOptimisticUpdate } from "./read-optimistic";
import { ReaderWordHighlighter } from "./reader-word-highlighter";
import { useArticleRecommend } from "./use-article-recommend";

const MEASURE = "80ch";

function scrollProgress(el: HTMLElement): number {
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? Math.min(1, el.scrollTop / max) : 0;
}

/** Prefer the article body scroller; fall back to the app-shell scroller. */
function articleScrollTargets(anchor: HTMLElement): Array<HTMLElement> {
  const outer = anchor.closest("[data-app-scroller]");
  return outer instanceof HTMLElement ? [anchor, outer] : [anchor];
}

const styles = stylex.create({
  root: {
    overflow: "hidden",
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,

    "--current-word-highlight-background-color": primaryColor.solid1,
    "--current-word-highlight-color": primaryColor.textContrast,
  },
  stickyChrome: {
    backgroundColor: `color-mix(in oklch, ${uiColor.bg} 95%, transparent)`,
    flexShrink: 0,
    position: "sticky",
    zIndex: 20,
    top: 0,
  },
  topBar: {
    alignItems: "center",
    backdropFilter: "blur(12px)",
    backgroundColor: `color-mix(in oklch, ${uiColor.bg} 90%, transparent)`,
    columnGap: {
      default: gap.sm,
      "@media (min-width: 40rem)": gap.lg,
    },
    display: "flex",
    flexShrink: 0,
    justifyContent: "space-between",
    rowGap: gap.lg,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3"],
    paddingLeft: {
      default: spacing["4"],
      "@media (min-width: 40rem)": spacing["5"],
    },
    paddingRight: {
      default: spacing["4"],
      "@media (min-width: 40rem)": spacing["5"],
    },
    paddingTop: spacing["3"],
  },
  scrollBody: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    overflowY: "auto",
    // The app shell's floating bottom-nav pill overlays this (own) scroller on
    // mobile, so reserve room (plus the safe-area inset) for trailing content;
    // the nav is hidden at desktop widths, so drop it there.
    paddingBottom: {
      default: `calc(env(safe-area-inset-bottom, 0px) + ${spacing["28"]})`,
      "@media (min-width: 60rem)": 0,
    },
  },
  // The floating page-reader bar overlays this scroller on every width while a
  // document is playing, so reserve extra room for trailing content (footer /
  // "more from"). On desktop the bottom-nav padding above is 0, so this is what
  // clears the bar.
  scrollBodyReader: {
    paddingBottom: {
      default: `calc(env(safe-area-inset-bottom, 0px) + ${spacing["40"]})`,
      "@media (min-width: 60rem)": spacing["28"],
    },
  },
  progressTrack: {
    backgroundColor: uiColor.component2,
    flexShrink: 0,
    position: "relative",
    height: spacing["1"],
    width: "100%",
  },
  topLeft: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    rowGap: gap.lg,
    minWidth: 0,
  },
  topActs: {
    alignItems: "center",
    columnGap: {
      default: gap.xs,
      "@media (min-width: 40rem)": gap.md,
    },
    display: "flex",
    flexShrink: 0,
    rowGap: gap.md,
  },
  pubByline: {
    borderWidth: 0,
    textDecoration: { default: "none", ":hover": "underline" },
    alignItems: "center",
    backgroundColor: "transparent",
    color: "inherit",
    columnGap: gap.md,
    cursor: "pointer",
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    rowGap: gap.md,
    textUnderlineOffset: "2px",
    minWidth: 0,
    paddingBottom: spacing["0"],
    paddingLeft: spacing["0"],
    paddingRight: spacing["0"],
    paddingTop: spacing["0"],
  },
  pubBylineName: {
    overflow: "hidden",
    color: uiColor.text2,
    flexShrink: 1,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0,
  },
  progress: {
    backgroundColor: primaryColor.solid1,
    position: "absolute",
    transitionDuration: animationDuration.fast,
    transitionProperty: "width",
    transitionTimingFunction: "linear",
    height: "100%",
    left: 0,
    top: 0,
  },
  article: {
    boxSizing: "border-box",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: MEASURE,
    paddingBottom: spacing["24"],
    paddingLeft: spacing["6"],
    paddingRight: spacing["6"],
    paddingTop: spacing["14"],
    width: "100%",
  },
  kicker: {
    textAlign: "center",
    marginBottom: spacing["5"],
  },
  title: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: {
      default: "2.125rem",
      "@media (min-width: 40rem)": "3.125rem",
    },
    fontStyle: "italic",
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
    textAlign: "center",
    // eslint-disable-next-line @stylexjs/valid-styles
    textWrap: "balance",
    marginBottom: spacing["5"],
    marginTop: spacing["0"],
  },
  dek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    textAlign: "center",
    // eslint-disable-next-line @stylexjs/valid-styles
    textWrap: "balance",
    marginBottom: spacing["7"],
    marginLeft: "auto",
    marginRight: "auto",
    marginTop: spacing["0"],
    maxWidth: "30ch",
  },
  byline: {
    alignItems: "center",
    columnGap: gap.lg,
    display: "flex",
    justifyContent: "center",
    rowGap: gap.lg,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginBottom: spacing["2"],
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
  },
  bylineWho: {
    gap: gap.sm,
    display: "flex",
    flexDirection: "column",
    textAlign: "left",
  },
  bylineName: {
    gap: gap.lg,
    alignItems: "center",
    color: uiColor.text2,
    display: "flex",
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  bylineNameLink: {
    textDecoration: { default: "none", ":hover": "underline" },
    color: "inherit",
    textUnderlineOffset: "2px",
  },
  bylineMeta: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  hero: {
    borderRadius: radius.lg,
    overflow: "hidden",
    aspectRatio: "16 / 9",
    marginBottom: spacing["10"],
    marginTop: spacing["10"],
  },
  heroImg: {
    display: "block",
    objectFit: "cover",
    height: "100%",
    width: "100%",
  },
  foot: {
    alignItems: "center",
    columnGap: gap.xl,
    display: "flex",
    rowGap: gap.xl,
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: spacing["14"],
    paddingTop: spacing["7"],
  },
  footGrow: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  footName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  moreFrom: {
    boxSizing: "border-box",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: MEASURE,
    paddingBottom: spacing["20"],
    paddingLeft: spacing["6"],
    paddingRight: spacing["6"],
    width: "100%",
  },
  moreRow: {
    textDecoration: "none",
    alignItems: "baseline",
    color: "inherit",
    columnGap: gap.lg,
    display: "flex",
    rowGap: gap.lg,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3"],
    paddingTop: spacing["3"],
  },
  moreTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
  },
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    textAlign: "center",
    paddingBottom: spacing["16"],
    paddingTop: spacing["16"],
  },
  bookmarkActive: {
    color: primaryColor.text2,
  },
  likePrompt: {
    gap: gap["2xl"],
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    textAlign: "center",
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: spacing["14"],
    paddingBottom: spacing["7"],
    paddingTop: spacing["10"],
  },
  likePromptTitle: {
    margin: spacing["0"],
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontStyle: "italic",
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
  },
  likePromptSubtext: {
    margin: spacing["0"],
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.base,
    maxWidth: "42ch",
  },
  likeButton: {
    borderColor: uiColor.border1,
    borderRadius: radius.full,
    borderStyle: "solid",
    borderWidth: 1,
    gap: gap.lg,
    alignItems: "center",
    backgroundColor: uiColor.bg,
    display: "inline-flex",
    transitionDuration: animationDuration.fast,
    transitionProperty: "background-color, border-color, color",
    transitionTimingFunction: "ease-in-out",
    paddingBottom: verticalSpace.md,
    paddingLeft: horizontalSpace["2xl"],
    paddingRight: horizontalSpace["2xl"],
    paddingTop: verticalSpace.md,
  },
  likeButtonActive: {
    borderColor: criticalColor.border1,
    backgroundColor: criticalColor.bgSubtle,
  },
  likeButtonHeart: {
    color: criticalColor.solid1,
    flexShrink: 0,
  },
  likeButtonLabel: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  likeButtonDivider: {
    alignSelf: "stretch",
    borderLeftColor: uiColor.border1,
    borderLeftStyle: "solid",
    borderLeftWidth: 1,
    width: spacing["0"],
  },
  likeButtonCount: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    fontWeight: fontWeight.normal,
    minWidth: spacing["6"],
  },
});

function articleTopic(article: ArticleDetail): string | null {
  if (article.tags && article.tags.length > 0) return article.tags[0] ?? null;
  return article.publication?.topic ?? null;
}

function primaryAuthor(article: ArticleDetail): string {
  const lead = article.contributors[0];
  if (lead?.displayName) return lead.displayName;
  if (article.publicationOwnerDisplayName) {
    return article.publicationOwnerDisplayName;
  }
  if (lead?.handle) return `@${lead.handle}`;
  if (article.publicationOwnerHandle)
    return `@${article.publicationOwnerHandle}`;
  return article.publication?.name ?? "Unknown author";
}

/** The author's bare @handle (lead contributor, else publication owner). */
function authorHandle(article: ArticleDetail): string | null {
  return (
    article.contributors[0]?.handle ?? article.publicationOwnerHandle ?? null
  );
}

/** Avatar for the article's author (lead contributor, else publication owner). */
function authorAvatarUrl(article: ArticleDetail): string | null {
  return (
    article.contributors[0]?.avatarUrl ??
    article.publication?.ownerAvatarUrl ??
    null
  );
}

function ArticleFollowButtonMd({
  publicationUri,
  signedIn,
}: {
  publicationUri: string;
  signedIn: boolean;
}) {
  const { data: follow } = useSuspenseQuery(
    readerApi.getFollowStatusQueryOptions(publicationUri),
  );
  return (
    <FollowButton
      publicationUri={publicationUri}
      signedIn={signedIn}
      initialFollowing={follow.isFollowing}
    />
  );
}

function BookmarkButton({
  recommended,
  onToggle,
}: {
  recommended: boolean;
  onToggle: () => void;
}) {
  return (
    <IconButton
      variant="secondary"
      size="md"
      label={recommended ? "Saved" : "Save"}
      onPress={onToggle}
      style={recommended ? styles.bookmarkActive : undefined}
    >
      <Bookmark size={18} fill={recommended ? "currentColor" : "none"} />
    </IconButton>
  );
}

function ArticleLikePrompt({
  recommended,
  onToggle,
  recommendCount,
}: {
  recommended: boolean;
  onToggle: () => void;
  recommendCount: number;
}) {
  return (
    <div {...stylex.props(styles.likePrompt)}>
      <h2 {...stylex.props(styles.likePromptTitle)}>
        Did this piece stay with you?
      </h2>
      <p {...stylex.props(styles.likePromptSubtext)}>
        Give it a heart — Standard Reader surfaces well-loved writing to more
        readers across the network.
      </p>
      <Button
        variant="secondary"
        aria-pressed={recommended}
        onPress={onToggle}
        style={[styles.likeButton, recommended && styles.likeButtonActive]}
      >
        <span {...stylex.props(styles.likeButtonHeart)}>
          <Heart
            size={18}
            strokeWidth={2}
            fill={recommended ? "currentColor" : "none"}
          />
        </span>
        <span {...stylex.props(styles.likeButtonLabel)}>
          {recommended ? "Liked" : "Like this article"}
        </span>
        <span aria-hidden {...stylex.props(styles.likeButtonDivider)} />
        <span {...stylex.props(styles.likeButtonCount)}>
          {formatReaders(recommendCount)}
        </span>
      </Button>
    </div>
  );
}

function MoreFromRow({
  article,
  publicationName,
}: {
  article: ArticleCard;
  publicationName: string;
}) {
  const params = documentLinkParams(article.uri);
  const minutes = readingMinutes(articleCardReadingText(article));
  const body = (
    <>
      <Flex direction="column" gap="sm" style={styles.footGrow}>
        <span {...stylex.props(styles.moreTitle)}>{article.title}</span>
        <span {...stylex.props(styles.bylineMeta)}>
          {minutes == null
            ? publicationName
            : `${publicationName} · ${minutes} min`}
        </span>
      </Flex>
    </>
  );

  // Only route through the in-app reader when there's a body to render;
  // "external" posts (no renderable body) link straight out in a new tab.
  if (params && article.hasRenderableBody) {
    return (
      <Link
        to="/a/$did/$rkey"
        params={params}
        {...stylex.props(styles.moreRow)}
      >
        {body}
      </Link>
    );
  }

  const href = article.canonicalUrl;
  if (!href) {
    // Non-renderable but no external URL: fall back to the in-app record page.
    if (params) {
      return (
        <Link
          to="/a/$did/$rkey"
          params={params}
          {...stylex.props(styles.moreRow)}
        >
          {body}
        </Link>
      );
    }
    return null;
  }
  const internal = parseInternalRoute(href);
  if (internal?.params) {
    return (
      <Link
        to={internal.to}
        params={internal.params}
        {...stylex.props(styles.moreRow)}
      >
        {body}
      </Link>
    );
  }
  if (internal) {
    return (
      <Link to={internal.to} {...stylex.props(styles.moreRow)}>
        {body}
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      {...stylex.props(styles.moreRow)}
    >
      {body}
    </a>
  );
}

export function ArticleView(props: {
  article: ArticleDetail;
  sharedQuote?: string | null;
}) {
  return <ArticleViewBody {...props} />;
}

/** Top-bar control to start/pause reading this article aloud. */
function TopListenButton({ article }: { article: ArticleDetail }) {
  const { nowPlaying, state, playArticle } = usePageReader();
  const available = useMemo(
    () => (articleSpeechText(article)?.trim().length ?? 0) > 0,
    [article],
  );
  if (!available) return null;

  // Once this article is loaded into the global player, its transport lives in
  // the playback toolbar — drop the header button to avoid a duplicate control.
  const isCurrent = nowPlaying?.uri === article.uri;
  if (isCurrent && state.status !== "idle") return null;

  return (
    <IconButton
      variant="secondary"
      size="md"
      label="Listen"
      onPress={() => playArticle(article)}
    >
      <Headphones size={18} />
    </IconButton>
  );
}

/** Scroll progress bar shown in the article's sticky chrome. */
function ReaderProgress({ progress }: { progress: number }) {
  return (
    <div {...stylex.props(styles.progressTrack)} aria-hidden>
      <div
        {...stylex.props(styles.progress)}
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}

function ArticleViewBody({
  article,
  sharedQuote,
}: {
  article: ArticleDetail;
  sharedQuote?: string | null;
}) {
  const router = useRouter();
  const { active: readerActive } = usePageReader();
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  const pub = article.publication;
  const pubParams = pub ? publicationLinkParams(pub.uri) : null;
  const authorName = primaryAuthor(article);
  const handle = authorHandle(article);
  const showHandle = handle != null && authorName !== `@${handle}`;
  const topic = articleTopic(article);
  const readingLabel = formatReadingTime(articleReadingText(article));
  const date = formatDate(article.publishedAt);
  const publicationArticleUrl = articlePublicationUrl(article);
  const linkParams = documentLinkParams(article.uri);

  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  const { recommended, toggle: toggleRecommend } = useArticleRecommend(
    article.uri,
    signedIn,
  );

  const readStats = formatArticleReadStats(article.readCount);
  const hasEngagement = article.recommendCount > 0 || article.commentCount > 0;

  const queryClient = useQueryClient();
  const { mutate: markRead } = useMutation(readerApi.markReadMutationOptions());
  const markedUriRef = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn || markedUriRef.current === article.uri) return;
    markedUriRef.current = article.uri;
    applyMarkReadOptimisticUpdate(
      queryClient,
      article.uri,
      article.publicationUri,
    );
    markRead(article.uri);
  }, [article.publicationUri, article.uri, signedIn, markRead, queryClient]);

  useLayoutEffect(() => {
    const anchor = scrollRef.current;

    if (!anchor) return;

    const targets = articleScrollTargets(anchor);

    const sync = (source?: HTMLElement) => {
      if (source) {
        setProgress(scrollProgress(source));
        return;
      }
      const active =
        targets.find((el) => el.scrollTop > 0) ??
        targets.find((el) => el.scrollHeight > el.clientHeight) ??
        anchor;
      setProgress(scrollProgress(active));
    };

    for (const el of targets) {
      if (!sharedQuote?.trim()) {
        el.scrollTop = 0;
      }
    }
    sync();

    const onScroll = (event: Event) => {
      if (event.currentTarget instanceof HTMLElement) {
        sync(event.currentTarget);
      }
    };

    for (const el of targets) {
      el.addEventListener("scroll", onScroll, { passive: true });
    }
    const resizeObserver = new ResizeObserver(() => sync());
    resizeObserver.observe(anchor);

    return () => {
      for (const el of targets) {
        el.removeEventListener("scroll", onScroll);
      }
      resizeObserver.disconnect();
    };
  }, [article.uri, sharedQuote]);

  const onShare = () => {
    if (!publicationArticleUrl) return;
    globalThis.open(
      buildBlueskyComposeUrl(publicationArticleUrl),
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.stickyChrome)}>
        <div {...stylex.props(styles.topBar)}>
          <div {...stylex.props(styles.topLeft)}>
            <IconButton
              variant="secondary"
              size="md"
              label="Back"
              onPress={() => {
                router.history.back();
              }}
            >
              <ArrowLeft size={18} />
            </IconButton>

            {pub ? (
              <>
                {pubParams ? (
                  <Link
                    to="/p/$did/$rkey"
                    params={pubParams}
                    {...stylex.props(styles.pubByline)}
                  >
                    <PublicationAvatar pub={pub} size="sm" />
                    <span {...stylex.props(styles.pubBylineName)}>
                      {pub.name}
                    </span>
                  </Link>
                ) : pub.url ? (
                  <AppLink href={pub.url} linkStyle={styles.pubByline}>
                    <PublicationAvatar pub={pub} size="sm" />
                    <span {...stylex.props(styles.pubBylineName)}>
                      {pub.name}
                    </span>
                  </AppLink>
                ) : (
                  <span {...stylex.props(styles.pubByline)}>
                    <PublicationAvatar pub={pub} size="sm" />
                    <span {...stylex.props(styles.pubBylineName)}>
                      {pub.name}
                    </span>
                  </span>
                )}
              </>
            ) : null}
          </div>

          <div {...stylex.props(styles.topActs)}>
            <TopListenButton article={article} />
            {publicationArticleUrl ? (
              <IconButton
                variant="secondary"
                size="md"
                label={pub ? `Open on ${pub.name}` : "Open on publication"}
                onPress={() => {
                  globalThis.open(
                    publicationArticleUrl,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                <ExternalLink size={18} />
              </IconButton>
            ) : null}
            <BookmarkButton
              recommended={recommended}
              onToggle={toggleRecommend}
            />
            <IconButton
              variant="secondary"
              size="md"
              label="Share on Bluesky"
              isDisabled={!publicationArticleUrl}
              onPress={onShare}
            >
              <Share2 size={18} />
            </IconButton>
          </div>
        </div>

        <ReaderProgress progress={progress} />
      </div>

      <div
        ref={scrollRef}
        {...stylex.props(
          styles.scrollBody,
          readerActive && styles.scrollBodyReader,
        )}
      >
        <ReaderWordHighlighter rootRef={articleRef} articleUri={article.uri} />
        <article ref={articleRef} {...stylex.props(styles.article)}>
          {topic ? (
            <div {...stylex.props(styles.kicker)}>
              <Kicker>
                <Topic name={topic} />
              </Kicker>
            </div>
          ) : null}

          <h1 {...stylex.props(styles.title)}>{article.title}</h1>

          {article.description ? (
            <p {...stylex.props(styles.dek)}>{article.description}</p>
          ) : null}

          <div {...stylex.props(styles.byline)}>
            <Avatar
              size="lg"
              src={authorAvatarUrl(article) ?? undefined}
              fallback={initials(authorName)}
              alt={authorName}
            />
            <div {...stylex.props(styles.bylineWho)}>
              <div {...stylex.props(styles.bylineName)}>
                {pubParams ? (
                  <Link
                    to="/p/$did/$rkey"
                    params={pubParams}
                    {...stylex.props(styles.bylineNameLink)}
                  >
                    {authorName}
                  </Link>
                ) : pub?.url ? (
                  <AppLink href={pub.url} linkStyle={styles.bylineNameLink}>
                    {authorName}
                  </AppLink>
                ) : (
                  authorName
                )}

                {showHandle ? (
                  <>
                    <Handle>@{handle}</Handle>
                  </>
                ) : null}
              </div>
              <Flex align="center" gap="md" wrap style={styles.bylineMeta}>
                <span>
                  {date}
                  {readingLabel ? ` · ${readingLabel}` : null}
                  {readStats ? ` · ${readStats}` : null}
                </span>
                {hasEngagement ? (
                  <>
                    <span aria-hidden>·</span>
                    <ArticleEngagement
                      recommendCount={article.recommendCount}
                      commentCount={article.commentCount}
                      size="sm"
                    />
                  </>
                ) : null}
              </Flex>
            </div>
          </div>

          {article.coverImageUrl ? (
            <div {...stylex.props(styles.hero)}>
              <img
                src={article.coverImageUrl}
                alt=""
                referrerPolicy="no-referrer"
                {...stylex.props(styles.heroImg)}
              />
            </div>
          ) : null}

          {linkParams ? (
            <QuoteShareLayer article={article} sharedQuote={sharedQuote}>
              <ArticleContent
                article={article}
                hasHero={Boolean(article.coverImageUrl)}
              />
            </QuoteShareLayer>
          ) : (
            <ArticleContent
              article={article}
              hasHero={Boolean(article.coverImageUrl)}
            />
          )}

          <ArticleLikePrompt
            recommended={recommended}
            onToggle={toggleRecommend}
            recommendCount={article.recommendCount}
          />

          {pub ? (
            <div {...stylex.props(styles.foot)}>
              <PublicationAvatar pub={pub} size="lg" />
              <Flex direction="column" gap="xs" style={styles.footGrow}>
                <div {...stylex.props(styles.footName)}>{pub.name}</div>
                {article.publicationOwnerHandle ? (
                  <Handle>@{article.publicationOwnerHandle}</Handle>
                ) : null}
              </Flex>
              {article.publicationUri ? (
                <ArticleFollowButtonMd
                  publicationUri={article.publicationUri}
                  signedIn={signedIn}
                />
              ) : null}
            </div>
          ) : null}
        </article>

        {pub && article.moreFrom.length > 0 ? (
          <div {...stylex.props(styles.moreFrom)}>
            <Flex direction="column">
              <SectionHead
                kicker={`More from ${pub.name}`}
                title="Keep reading"
              />
              <div>
                {article.moreFrom.map((doc) => (
                  <MoreFromRow
                    key={doc.uri}
                    article={doc}
                    publicationName={pub.name}
                  />
                ))}
              </div>
            </Flex>
          </div>
        ) : null}

        {linkParams ? <CommentsSection documentUri={article.uri} /> : null}

        {article.readersAlsoFollow.length > 0 ? (
          <div {...stylex.props(styles.moreFrom)}>
            <Flex direction="column">
              <SectionHead kicker="Discover" title="You might follow" />
              <div>
                {article.readersAlsoFollow.map((suggestedPub, i, pubs) => (
                  <MiniPubRow
                    key={suggestedPub.uri}
                    pub={suggestedPub}
                    isLast={i === pubs.length - 1}
                  />
                ))}
              </div>
            </Flex>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ArticleNotFound() {
  return (
    <div {...stylex.props(styles.emptyNote)}>
      We couldn’t find that article.
    </div>
  );
}
