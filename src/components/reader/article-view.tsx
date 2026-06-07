"use client";

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
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
import { ArticleContent } from "./content/article-content";
import {
  articleCardReadingText,
  articleReadingText,
} from "./content/extract-text";
import {
  articlePublicationUrl,
  documentLinkParams,
  formatDate,
  formatReadingTime,
  publicationLinkParams,
  readingMinutes,
} from "./format";
import {
  Handle,
  Kicker,
  PublicationAvatar,
  SectionHead,
  Topic,
} from "./primitives";

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
    columnGap: gap.lg,
    display: "flex",
    flexShrink: 0,
    justifyContent: "space-between",
    rowGap: gap.lg,
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3"],
    paddingLeft: {
      default: "1.1rem",
      "@media (min-width: 40rem)": spacing["5"],
    },
    paddingRight: {
      default: "1.1rem",
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
    columnGap: gap.md,
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
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
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
  initialBookmarked = false,
}: {
  documentUri: string;
  signedIn: boolean;
  initialBookmarked?: boolean;
}) {
  const queryClient = useQueryClient();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const bookmarkMutation = useMutation(
    readerApi.bookmarkDocumentMutationOptions(),
  );
  const unbookmarkMutation = useMutation(
    readerApi.unbookmarkDocumentMutationOptions(),
  );

  const onPress = () => {
    if (!signedIn) return;
    const next = !bookmarked;
    setBookmarked(next);
    const mutation = next ? bookmarkMutation : unbookmarkMutation;
    mutation.mutate(documentUri, {
      onError: () => setBookmarked(!next),
      onSettled: () => {
        void queryClient.invalidateQueries({
          queryKey: ["reader", "bookmarkStatus", documentUri],
        });
      },
    });
  };

  return (
    <IconButton
      variant="secondary"
      size="md"
      label={bookmarked ? "Saved" : "Save"}
      onPress={onPress}
      isDisabled={!signedIn}
      style={bookmarked ? styles.bookmarkActive : undefined}
    >
      <Bookmark size={18} fill={bookmarked ? "currentColor" : "none"} />
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

export function ArticleView({ article }: { article: ArticleDetail }) {
  return <ArticleViewInner key={article.uri} article={article} />;
}

function ArticleViewInner({ article }: { article: ArticleDetail }) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const pub = article.publication;
  const pubParams = pub ? publicationLinkParams(pub.uri) : null;
  const topic = articleTopic(article);
  const readingLabel = formatReadingTime(articleReadingText(article));
  const date = formatDate(article.publishedAt);
  const publicationArticleUrl = articlePublicationUrl(article);

  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  const { data: bookmark } = useSuspenseQuery(
    readerApi.getBookmarkStatusQueryOptions(article.uri),
  );

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
      el.scrollTop = 0;
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
  }, [article.uri]);

  const share = async () => {
    const url = globalThis.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: article.title, url });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
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
                      <Handle>@{article.publicationOwnerHandle}</Handle>
                    ) : null}
                  </Link>
                ) : (
                  <a
                    href={pub.url}
                    target="_blank"
                    rel="noreferrer"
                    {...stylex.props(styles.pubByline)}
                  >
                    <span {...stylex.props(styles.pubBylineName)}>
                      {pub.name}
                    </span>
                  </a>
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
              initialBookmarked={bookmark?.isBookmarked ?? false}
            />
            <IconButton
              variant="secondary"
              size="md"
              label="Share"
              onPress={() => void share()}
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
                {pub?.url ? (
                  <a
                    href={pub.url}
                    target="_blank"
                    rel="noreferrer"
                    {...stylex.props(styles.bylineNameLink)}
                  >
                    {primaryAuthor(article)}
                  </a>
                ) : (
                  primaryAuthor(article)
                )}
              </div>
              <div {...stylex.props(styles.bylineMeta)}>
                {date}
                {readingLabel ? ` · ${readingLabel}` : null}
              </div>
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

          <ArticleContent
            article={article}
            hasHero={Boolean(article.coverImageUrl)}
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
