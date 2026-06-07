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
import { ArrowLeft, Bookmark, ExternalLink, Share2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { ArticleCard } from "../../integrations/tanstack-query/api-shapes";

import { Flex } from "../../design-system/flex";
import { IconButton } from "../../design-system/icon-button";
import { animationDuration } from "../../design-system/theme/animations.stylex";
import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import { gap } from "../../design-system/theme/semantic-spacing.stylex";
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
} from "./content/extract-text";
import {
  articlePublicationUrl,
  documentLinkParams,
  formatArticleReadStats,
  formatDate,
  formatReadingTime,
  publicationLinkParams,
  readingMinutes,
} from "./format";
import {
  Handle,
  Kicker,
  ArticleEngagement,
  PublicationAvatar,
  SectionHead,
  Topic,
} from "./primitives";
import { buildBlueskyComposeUrl } from "#/lib/quote-share";

import { QuoteShareLayer } from "./quote-share-layer";

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
    minWidth: 0,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  pubBylineHandle: {
    display: {
      default: "none",
      "@media (min-width: 40rem)": "inline",
    },
    flexShrink: 0,
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
    color: uiColor.text2,
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
});

function articleTopic(article: ArticleDetail): string | null {
  if (article.tags && article.tags.length > 0) return article.tags[0] ?? null;
  return article.publication?.topic ?? null;
}

function primaryAuthor(article: ArticleDetail): string {
  const lead = article.contributors[0];
  if (lead?.displayName) return lead.displayName;
  if (lead?.handle) return `@${lead.handle}`;
  return article.publication?.name ?? "Unknown author";
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
  documentUri,
  signedIn,
  initialRecommended = false,
}: {
  documentUri: string;
  signedIn: boolean;
  initialRecommended?: boolean;
}) {
  const queryClient = useQueryClient();
  const [recommended, setRecommended] = useState(initialRecommended);
  const recommendMutation = useMutation(
    readerApi.recommendDocumentMutationOptions(),
  );
  const unrecommendMutation = useMutation(
    readerApi.unrecommendDocumentMutationOptions(),
  );

  const onPress = () => {
    if (!signedIn) return;
    const next = !recommended;
    setRecommended(next);
    const mutation = next ? recommendMutation : unrecommendMutation;
    mutation.mutate(documentUri, {
      onError: () => setRecommended(!next),
      onSettled: () => {
        void queryClient.invalidateQueries({
          queryKey: ["reader", "recommendStatus", documentUri],
        });
        void queryClient.invalidateQueries({
          queryKey: ["article", documentUri],
        });
      },
    });
  };

  return (
    <IconButton
      variant="secondary"
      size="md"
      label={recommended ? "Saved" : "Save"}
      onPress={onPress}
      isDisabled={!signedIn}
      style={recommended ? styles.bookmarkActive : undefined}
    >
      <Bookmark size={18} fill={recommended ? "currentColor" : "none"} />
    </IconButton>
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
          {minutes != null
            ? `${publicationName} · ${minutes} min`
            : publicationName}
        </span>
      </Flex>
    </>
  );

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

  const href = article.canonicalUrl;
  if (!href) return null;
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

export function ArticleView({
  article,
  sharedQuote = null,
}: {
  article: ArticleDetail;
  sharedQuote?: string | null;
}) {
  return (
    <ArticleViewInner
      key={article.uri}
      article={article}
      sharedQuote={sharedQuote}
    />
  );
}

function ArticleViewInner({
  article,
  sharedQuote,
}: {
  article: ArticleDetail;
  sharedQuote?: string | null;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const pub = article.publication;
  const pubParams = pub ? publicationLinkParams(pub.uri) : null;
  const topic = articleTopic(article);
  const readingLabel = formatReadingTime(articleReadingText(article));
  const date = formatDate(article.publishedAt);
  const publicationArticleUrl = articlePublicationUrl(article);
  const linkParams = documentLinkParams(article.uri);

  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  const { data: recommend } = useSuspenseQuery(
    readerApi.getRecommendStatusQueryOptions(article.uri),
  );

  const readStats = formatArticleReadStats(article.readCount);
  const hasEngagement = article.recommendCount > 0 || article.commentCount > 0;

  const { mutate: markRead } = useMutation(readerApi.markReadMutationOptions());
  const markedUriRef = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn || markedUriRef.current === article.uri) return;
    markedUriRef.current = article.uri;
    markRead(article.uri);
  }, [article.uri, signedIn, markRead]);

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
                    <span {...stylex.props(styles.pubBylineName)}>
                      {pub.name}
                    </span>
                    {article.publicationOwnerHandle ? (
                      <Handle style={styles.pubBylineHandle}>
                        @{article.publicationOwnerHandle}
                      </Handle>
                    ) : null}
                  </Link>
                ) : pub.url ? (
                  <AppLink href={pub.url} linkStyle={styles.pubByline}>
                    <span {...stylex.props(styles.pubBylineName)}>
                      {pub.name}
                    </span>
                  </AppLink>
                ) : (
                  <span {...stylex.props(styles.pubByline)}>
                    <span {...stylex.props(styles.pubBylineName)}>
                      {pub.name}
                    </span>
                  </span>
                )}
              </>
            ) : null}
          </div>

          <div {...stylex.props(styles.topActs)}>
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
              documentUri={article.uri}
              signedIn={signedIn}
              initialRecommended={recommend?.isRecommended ?? false}
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

        <div {...stylex.props(styles.progressTrack)} aria-hidden>
          <div
            {...stylex.props(styles.progress)}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      <div ref={scrollRef} {...stylex.props(styles.scrollBody)}>
        <article {...stylex.props(styles.article)}>
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
            {pub ? <PublicationAvatar pub={pub} size="lg" /> : null}
            <div {...stylex.props(styles.bylineWho)}>
              <div {...stylex.props(styles.bylineName)}>
                {pubParams ? (
                  <Link
                    to="/p/$did/$rkey"
                    params={pubParams}
                    {...stylex.props(styles.bylineNameLink)}
                  >
                    {primaryAuthor(article)}
                  </Link>
                ) : pub?.url ? (
                  <AppLink href={pub.url} linkStyle={styles.bylineNameLink}>
                    {primaryAuthor(article)}
                  </AppLink>
                ) : (
                  primaryAuthor(article)
                )}
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
                {article.readersAlsoFollow.map((recommended, i, pubs) => (
                  <MiniPubRow
                    key={recommended.uri}
                    pub={recommended}
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
