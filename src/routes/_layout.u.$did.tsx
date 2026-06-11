import type {
  ArticleCard,
  PublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import type { RefObject } from "react";

import * as stylex from "@stylexjs/stylex";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { formatReaders, initials } from "#/components/reader/format";
import {
  AUTHOR_ACTIVITY_PAGE_SIZE,
  authorApi,
} from "#/integrations/tanstack-query/api-author.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { siteSocialMeta } from "#/lib/site-metadata";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ArticleRow, PubDirectoryRow } from "../components/reader/cards";
import { LinkifiedText } from "../components/reader/linkified-text";
import {
  Handle,
  Kicker,
  ReaderContent,
  SectionHead,
} from "../components/reader/primitives";
import { SifaResumeChip } from "../components/reader/sifa-resume-chip";
import { ShareMenu } from "../components/reader/share-menu";
import { Avatar } from "../design-system/avatar";
import { IconButton } from "../design-system/icon-button";
import { uiColor } from "../design-system/theme/color.stylex";
import { size as boxSize } from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../design-system/theme/typography.stylex";

const AUTHOR_PAGE_SIZE = 24;

export const Route = createFileRoute("/_layout/u/$did")({
  loader: async ({ context, params }) => {
    const page = await context.queryClient.ensureQueryData(
      authorApi.getAuthorProfileQueryOptions(params.did, {
        limit: AUTHOR_PAGE_SIZE,
      }),
    );
    const profile = page?.profile;
    if (page) {
      void context.queryClient.prefetchQuery(
        authorApi.getAuthorSifaProfileQueryOptions(
          params.did,
          profile?.handle ?? null,
        ),
      );
    }
    const displayName =
      profile?.displayName?.trim() ||
      (profile?.handle ? `@${profile.handle}` : null);
    return {
      displayName,
      description: profile?.description ?? null,
      handle: profile?.handle ?? null,
    };
  },
  head: ({ loaderData, match }) => {
    const name = loaderData?.displayName;
    if (!name) {
      return { meta: [{ title: "Standard Reader" }] };
    }
    const baseUrl = getPublicUrlClient();
    const handle = loaderData?.handle;
    return {
      meta: siteSocialMeta({
        title: `${name} · Standard Reader`,
        description:
          loaderData?.description?.trim() ||
          `Publications by ${handle ? `@${handle}` : name} on Standard Reader.`,
        url: `${baseUrl}${match.pathname}`,
      }),
    };
  },
  component: AuthorProfilePage,
});

const styles = stylex.create({
  hero: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
  },
  heroInner: {
    alignItems: "flex-start",
    boxSizing: "border-box",
    columnGap: spacing["5"],
    display: "flex",
    flexWrap: "wrap",
    rowGap: spacing["4"],
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "1320px",
    paddingBottom: spacing["6"],
    paddingLeft: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingRight: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingTop: spacing["6"],
    width: "100%",
  },
  avatarWrap: {
    flexShrink: 0,
  },
  avatar: {
    height: boxSize["6xl"],
    width: boxSize["6xl"],
  },
  heroInfo: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: "240px",
    paddingTop: spacing["0.5"],
  },
  heroName: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: { default: "1.85rem", "@media (min-width: 48rem)": "2rem" },
    fontWeight: fontWeight.semibold,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.xs,
    marginBottom: spacing["0"],
    marginTop: spacing["2"],
  },
  heroDesc: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["2"],
    maxWidth: "60ch",
  },
  stats: {
    alignItems: "baseline",
    color: uiColor.text1,
    columnGap: spacing["6"],
    display: "flex",
    flexWrap: "wrap",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    rowGap: spacing["2"],
    marginTop: spacing["4"],
  },
  statValue: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginRight: spacing["1"],
  },
  heroActs: {
    alignItems: "center",
    columnGap: spacing["1.5"],
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    rowGap: spacing["2.5"],
    paddingTop: spacing["1"],
  },
  section: {
    marginTop: spacing["8"],
  },
  sectionLast: {
    paddingBottom: spacing["10"],
  },
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    fontStyle: "italic",
    textAlign: "center",
    paddingBottom: spacing["8"],
    paddingTop: spacing["8"],
  },
  loadSentinel: {
    height: 1,
    marginTop: spacing["6"],
    width: "100%",
  },
  endNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: spacing["6"],
  },
});

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <span>
      <span {...stylex.props(styles.statValue)}>{value}</span>
      {label}
    </span>
  );
}

function authorDisplayName(profile: {
  displayName: string | null;
  handle: string | null;
}): string {
  if (profile.displayName?.trim()) return profile.displayName.trim();
  if (profile.handle) return `@${profile.handle}`;
  return "Author";
}

function useInfiniteScroll(
  nextOffset: number | null,
  loadMore: () => Promise<void>,
) {
  const loadingMoreRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (nextOffset == null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await loadMore();
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [loadMore, nextOffset]);

  useEffect(() => {
    if (nextOffset == null) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const root = sentinel.closest("[data-app-scroller]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void load();
        }
      },
      { root, rootMargin: "1200px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextOffset, load]);

  return { loadingMore, sentinelRef };
}

function LoadMoreFooter({
  nextOffset,
  loadingMore,
  sentinelRef,
  showEndNote = false,
}: {
  nextOffset: number | null;
  loadingMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  showEndNote?: boolean;
}) {
  if (nextOffset == null) {
    return showEndNote ? (
      <div {...stylex.props(styles.endNote)}>You&apos;ve reached the end.</div>
    ) : null;
  }

  return (
    <div>
      <div
        ref={sentinelRef}
        aria-hidden
        {...stylex.props(styles.loadSentinel)}
      />
      {loadingMore ? (
        <div {...stylex.props(styles.endNote)}>Loading more…</div>
      ) : null}
    </div>
  );
}

function AuthorSifaResumeChip({
  did,
  handle,
}: {
  did: string;
  handle: string | null;
}) {
  const { data: sifaProfileUrl } = useQuery(
    authorApi.getAuthorSifaProfileQueryOptions(did, handle),
  );
  if (!sifaProfileUrl) return null;
  return <SifaResumeChip href={sifaProfileUrl} />;
}

function AuthorProfilePage() {
  const { did } = Route.useParams();
  const { data: initialPage } = useSuspenseQuery(
    authorApi.getAuthorProfileQueryOptions(did, {
      limit: AUTHOR_PAGE_SIZE,
      activityLimit: AUTHOR_ACTIVITY_PAGE_SIZE,
    }),
  );

  const [publications, setPublications] = useState<Array<PublicationCard>>(
    () => initialPage?.publications ?? [],
  );
  const [publicationsNextOffset, setPublicationsNextOffset] = useState<
    number | null
  >(() => initialPage?.publicationsNextOffset ?? null);

  const [subscriptions, setSubscriptions] = useState<Array<PublicationCard>>(
    () => initialPage?.subscriptions ?? [],
  );
  const [subscriptionsNextOffset, setSubscriptionsNextOffset] = useState<
    number | null
  >(() => initialPage?.subscriptionsNextOffset ?? null);

  const [recommendations, setRecommendations] = useState<Array<ArticleCard>>(
    () => initialPage?.recommendations ?? [],
  );
  const [recommendationsNextOffset, setRecommendationsNextOffset] = useState<
    number | null
  >(() => initialPage?.recommendationsNextOffset ?? null);

  useEffect(() => {
    setPublications(initialPage?.publications ?? []);
    setPublicationsNextOffset(initialPage?.publicationsNextOffset ?? null);
    setSubscriptions(initialPage?.subscriptions ?? []);
    setSubscriptionsNextOffset(initialPage?.subscriptionsNextOffset ?? null);
    setRecommendations(initialPage?.recommendations ?? []);
    setRecommendationsNextOffset(
      initialPage?.recommendationsNextOffset ?? null,
    );
  }, [initialPage]);

  const loadMorePublications = useCallback(async () => {
    if (publicationsNextOffset == null) return;
    const page = await authorApi.getAuthorPublications({
      data: {
        did,
        limit: AUTHOR_PAGE_SIZE,
        offset: publicationsNextOffset,
      },
    });
    setPublications((prev) => {
      const seen = new Set(prev.map((pub) => pub.uri));
      return [...prev, ...page.items.filter((pub) => !seen.has(pub.uri))];
    });
    setPublicationsNextOffset(page.nextOffset);
  }, [did, publicationsNextOffset]);

  const loadMoreSubscriptions = useCallback(async () => {
    if (subscriptionsNextOffset == null) return;
    const page = await authorApi.getAuthorSubscriptions({
      data: {
        did,
        limit: AUTHOR_ACTIVITY_PAGE_SIZE,
        offset: subscriptionsNextOffset,
      },
    });
    setSubscriptions((prev) => {
      const seen = new Set(prev.map((pub) => pub.uri));
      return [...prev, ...page.items.filter((pub) => !seen.has(pub.uri))];
    });
    setSubscriptionsNextOffset(page.nextOffset);
  }, [did, subscriptionsNextOffset]);

  const loadMoreRecommendations = useCallback(async () => {
    if (recommendationsNextOffset == null) return;
    const page = await authorApi.getAuthorRecommendations({
      data: {
        did,
        limit: AUTHOR_ACTIVITY_PAGE_SIZE,
        offset: recommendationsNextOffset,
      },
    });
    setRecommendations((prev) => {
      const seen = new Set(prev.map((article) => article.uri));
      return [
        ...prev,
        ...page.items.filter((article) => !seen.has(article.uri)),
      ];
    });
    setRecommendationsNextOffset(page.nextOffset);
  }, [did, recommendationsNextOffset]);

  const publicationsScroll = useInfiniteScroll(
    publicationsNextOffset,
    loadMorePublications,
  );
  const subscriptionsScroll = useInfiniteScroll(
    subscriptionsNextOffset,
    loadMoreSubscriptions,
  );
  const recommendationsScroll = useInfiniteScroll(
    recommendationsNextOffset,
    loadMoreRecommendations,
  );

  if (!initialPage) {
    return (
      <ReaderContent>
        <div {...stylex.props(styles.emptyNote)}>
          We couldn&apos;t find that author.
        </div>
      </ReaderContent>
    );
  }

  const { profile, stats } = initialPage;
  const name = authorDisplayName(profile);
  const pageUrl = `${getPublicUrlClient()}/u/${did}`;
  const showSubscriptions = stats.subscriptionCount > 0;
  const showRecommendations = stats.recommendationCount > 0;

  return (
    <div>
      <div {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.heroInner)}>
          <div {...stylex.props(styles.avatarWrap)}>
            <Avatar
              size="xl"
              src={profile.avatarUrl ?? undefined}
              fallback={initials(name)}
              alt={name}
              style={styles.avatar}
            />
          </div>

          <div {...stylex.props(styles.heroInfo)}>
            <Kicker>Author</Kicker>
            <h1 {...stylex.props(styles.heroName)}>{name}</h1>
            {profile.description ? (
              <p {...stylex.props(styles.heroDesc)}>
                <LinkifiedText text={profile.description} />
              </p>
            ) : null}
            <div {...stylex.props(styles.stats)}>
              {profile.handle ? <Handle>@{profile.handle}</Handle> : null}
              <Stat
                value={String(stats.publicationCount)}
                label={
                  stats.publicationCount === 1 ? "publication" : "publications"
                }
              />
              <Stat value={String(stats.documentCount)} label="posts" />
              <Stat
                value={formatReaders(stats.subscriberCount)}
                label="readers"
              />
              {stats.subscriptionCount > 0 ? (
                <Stat
                  value={String(stats.subscriptionCount)}
                  label={
                    stats.subscriptionCount === 1 ? "following" : "following"
                  }
                />
              ) : null}
              {stats.recommendationCount > 0 ? (
                <Stat
                  value={String(stats.recommendationCount)}
                  label={stats.recommendationCount === 1 ? "like" : "likes"}
                />
              ) : null}
              <AuthorSifaResumeChip did={did} handle={profile.handle} />
            </div>
          </div>

          <div {...stylex.props(styles.heroActs)}>
            <ShareMenu variant="icon" pageUrl={pageUrl} />
            {profile.handle ? (
              <IconButton
                variant="secondary"
                size="md"
                label="View on Bluesky"
                onPress={() => {
                  window.open(
                    `https://bsky.app/profile/${profile.handle}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                <ExternalLink size={15} />
              </IconButton>
            ) : null}
          </div>
        </div>
      </div>

      <ReaderContent>
        <div
          {...stylex.props(
            styles.section,
            !showSubscriptions && !showRecommendations && styles.sectionLast,
          )}
        >
          <SectionHead kicker="Publications" title="All publications" />
          {publications.length === 0 ? (
            <div {...stylex.props(styles.emptyNote)}>
              No publications indexed from this author yet.
            </div>
          ) : (
            <div>
              {publications.map((pub, index) => (
                <PubDirectoryRow
                  key={pub.uri}
                  pub={pub}
                  isFirstInSection={index === 0}
                  isLast={
                    index === publications.length - 1 &&
                    publicationsNextOffset == null
                  }
                />
              ))}
              <LoadMoreFooter
                nextOffset={publicationsNextOffset}
                loadingMore={publicationsScroll.loadingMore}
                sentinelRef={publicationsScroll.sentinelRef}
              />
            </div>
          )}
        </div>

        {showSubscriptions ? (
          <div
            {...stylex.props(
              styles.section,
              !showRecommendations && styles.sectionLast,
            )}
          >
            <SectionHead kicker="Following" title="Subscriptions" />
            {subscriptions.length === 0 ? (
              <div {...stylex.props(styles.emptyNote)}>
                Subscriptions aren&apos;t indexed yet.
              </div>
            ) : (
              <div>
                {subscriptions.map((pub, index) => (
                  <PubDirectoryRow
                    key={pub.uri}
                    pub={pub}
                    isFirstInSection={index === 0}
                    isLast={
                      index === subscriptions.length - 1 &&
                      subscriptionsNextOffset == null
                    }
                  />
                ))}
                <LoadMoreFooter
                  nextOffset={subscriptionsNextOffset}
                  loadingMore={subscriptionsScroll.loadingMore}
                  sentinelRef={subscriptionsScroll.sentinelRef}
                />
              </div>
            )}
          </div>
        ) : null}

        {showRecommendations ? (
          <div {...stylex.props(styles.section, styles.sectionLast)}>
            <SectionHead kicker="Likes" title="Liked articles" />
            {recommendations.length === 0 ? (
              <div {...stylex.props(styles.emptyNote)}>
                Likes aren&apos;t indexed yet.
              </div>
            ) : (
              <div>
                {recommendations.map((article, index) => (
                  <ArticleRow
                    key={article.uri}
                    article={article}
                    isFirstInSection={index === 0}
                    showSaveButton={false}
                  />
                ))}
                <LoadMoreFooter
                  nextOffset={recommendationsNextOffset}
                  loadingMore={recommendationsScroll.loadingMore}
                  sentinelRef={recommendationsScroll.sentinelRef}
                  showEndNote
                />
              </div>
            )}
          </div>
        ) : null}
      </ReaderContent>
    </div>
  );
}
