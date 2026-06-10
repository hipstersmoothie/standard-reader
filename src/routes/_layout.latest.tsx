"use client";

import type { LatestFilter } from "#/integrations/tanstack-query/api-feed.functions";

import * as stylex from "@stylexjs/stylex";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  TRENDING_PAGE_LIMIT,
  feedApi,
  latestFeedPageSize,
} from "#/integrations/tanstack-query/api-feed.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { formatCount } from "#/lib/format-count";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";
import { useLoginSearch } from "#/utils/use-login-search";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";

import type { ArticleCard } from "../integrations/tanstack-query/api-shapes";

import { ArticleRow } from "../components/reader/cards";
import { Masthead, ReaderContent } from "../components/reader/primitives";
import {
  applyMarkReadManyOptimisticUpdate,
  invalidateReadQueries,
} from "../components/reader/read-optimistic";
import { Button } from "../design-system/button";
import { Flex } from "../design-system/flex";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../design-system/segmented-control";
import { Skeleton } from "../design-system/skeleton";
import { uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import { gap } from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../design-system/theme/typography.stylex";

const SKELETON_ROWS = 8;

const latestSearchSchema = z.object({
  filter: z
    .enum(["unread", "subscriptions", "all", "trending"])
    .default("subscriptions"),
});

const LATEST_FILTERS = [
  "unread",
  "subscriptions",
  "all",
  "trending",
] as const satisfies ReadonlyArray<LatestFilter>;

export const Route = createFileRoute("/_layout/latest")({
  validateSearch: latestSearchSchema,
  loaderDeps: ({ search }) => ({ filter: search.filter }),
  loader: ({ context, deps }) => {
    void context.queryClient.prefetchQuery(
      feedApi.getLatestFeedQueryOptions({
        filter: deps.filter,
        limit: latestFeedPageSize(deps.filter),
        offset: 0,
      }),
    );
  },
  head: () => ({
    meta: pageSocialMeta("latest", getPublicUrlClient()),
  }),
  component: Latest,
});

const styles = stylex.create({
  controls: {
    alignItems: {
      default: "stretch",
      "@media (min-width: 40rem)": "center",
    },
    columnGap: spacing["4"],
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 40rem)": "row",
    },
    justifyContent: "space-between",
    rowGap: spacing["3"],
    marginBottom: spacing["6"],
  },
  emptyCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    marginTop: spacing["6"],
    paddingBottom: spacing["10"],
    paddingLeft: spacing["8"],
    paddingRight: spacing["8"],
    paddingTop: spacing["10"],
  },
  emptyTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
  },
  emptyDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    maxWidth: "52ch",
  },
  articleSkeleton: {
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
  articleSkeletonLast: {
    borderBottomWidth: 0,
  },
  articleSkeletonFirst: {
    paddingTop: spacing["0"],
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

function ArticleRowSkeleton({
  isLast = false,
  isFirst = false,
}: {
  isLast?: boolean;
  isFirst?: boolean;
}) {
  return (
    <div
      aria-hidden
      {...stylex.props(
        styles.articleSkeleton,
        isLast && styles.articleSkeletonLast,
        isFirst && styles.articleSkeletonFirst,
      )}
    >
      <Flex direction="column" gap="2xl">
        <Skeleton variant="rectangle" height={spacing["3.5"]} width="28%" />
        <Skeleton variant="rectangle" height={spacing["6"]} width="72%" />
        <Skeleton variant="rectangle" height={spacing["4"]} width="88%" />
        <Skeleton variant="rectangle" height={spacing["3.5"]} width="34%" />
      </Flex>
      <Skeleton
        variant="rectangle"
        height={spacing["20"]}
        width={spacing["28"]}
      />
    </div>
  );
}

function LatestFeedSkeleton({ rows = SKELETON_ROWS }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading articles">
      {Array.from({ length: rows }, (_, index) => (
        <ArticleRowSkeleton
          key={index}
          isFirst={index === 0}
          isLast={index === rows - 1}
        />
      ))}
    </div>
  );
}

function LatestFeedPanel({ filter }: { filter: LatestFilter }) {
  const navigate = useNavigate({ from: Route.fullPath });
  const pageSize = latestFeedPageSize(filter);

  const { data: feed } = useSuspenseQuery(
    feedApi.getLatestFeedQueryOptions({
      filter,
      limit: pageSize,
      offset: 0,
    }),
  );

  const [extraItems, setExtraItems] = useState<Array<ArticleCard>>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(feed.nextOffset);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setExtraItems([]);
    setNextOffset(feed.nextOffset);
  }, [feed]);

  const { data: session } = useQuery(user.getSessionQueryOptions);
  const { enabled: trackReading } = useTrackReadingHistory();
  const signedIn = Boolean(session?.user);

  const items = useMemo(
    () => [...feed.items, ...extraItems],
    [feed.items, extraItems],
  );

  const isUnread = (article: ArticleCard) =>
    trackReading && signedIn && !article.isRead;

  const loadMoreFeed = useCallback(async () => {
    if (nextOffset == null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await feedApi.getLatestFeed({
        data: { filter, limit: pageSize, offset: nextOffset },
      });
      setExtraItems((prev) => [...prev, ...page.items]);
      setNextOffset(page.nextOffset);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [filter, nextOffset, pageSize]);

  useEffect(() => {
    if (nextOffset == null) return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const root = sentinel.closest("[data-app-scroller]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreFeed();
        }
      },
      { root, rootMargin: "1200px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreFeed, nextOffset]);

  const isTrending = filter === "trending";
  const isNetwork = !signedIn || filter === "all" || isTrending;

  if (items.length === 0) {
    return (
      <>
        {isTrending ? (
          <Flex direction="column" gap="2xl" style={styles.emptyCard}>
            <span {...stylex.props(styles.emptyTitle)}>
              Nothing trending yet
            </span>
            <span {...stylex.props(styles.emptyDek)}>
              No articles are trending across the network right now. Check back
              soon.
            </span>
          </Flex>
        ) : isNetwork ? (
          <Flex direction="column" gap="2xl" style={styles.emptyCard}>
            <span {...stylex.props(styles.emptyTitle)}>Nothing here yet</span>
            <span {...stylex.props(styles.emptyDek)}>
              Nothing has been published across the network recently.
            </span>
          </Flex>
        ) : feed.counts.subscriptions === 0 ? (
          <Flex direction="column" gap="2xl" style={styles.emptyCard}>
            <span {...stylex.props(styles.emptyTitle)}>Nothing here yet</span>
            <span {...stylex.props(styles.emptyDek)}>
              Follow a few publications and their latest writing will show up
              here.
            </span>
            <Flex>
              <Link to="/discover">
                <Button>Explore the directory</Button>
              </Link>
            </Flex>
          </Flex>
        ) : (
          <Flex direction="column" gap="2xl" style={styles.emptyCard}>
            <span {...stylex.props(styles.emptyTitle)}>All caught up</span>
            <span {...stylex.props(styles.emptyDek)}>
              No unread articles from your follows right now.
            </span>
            <Flex>
              <Button
                variant="secondary"
                onPress={() =>
                  void navigate({ search: { filter: "subscriptions" } })
                }
              >
                Show all subscriptions
              </Button>
            </Flex>
          </Flex>
        )}
      </>
    );
  }

  return (
    <>
      <div>
        {items.map((article, index) => (
          <ArticleRow
            key={article.uri}
            article={article}
            unread={signedIn && (filter === "unread" || isUnread(article))}
            showSaveButton={false}
            isFirstInSection={index === 0}
          />
        ))}
      </div>

      {nextOffset == null ? (
        <p {...stylex.props(styles.endNote)}>You&apos;ve reached the end.</p>
      ) : (
        <>
          <div
            ref={loadMoreSentinelRef}
            aria-hidden
            {...stylex.props(styles.loadSentinel)}
          />
          {loadingMore ? <LatestFeedSkeleton rows={3} /> : null}
        </>
      )}
    </>
  );
}

function Latest() {
  const { filter } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const pageSize = latestFeedPageSize(filter);

  const { data: feedMeta } = useQuery({
    ...feedApi.getLatestFeedQueryOptions({
      filter,
      limit: pageSize,
      offset: 0,
    }),
    placeholderData: keepPreviousData,
  });

  const counts = feedMeta?.counts ?? {
    unread: 0,
    subscriptions: 0,
    all: 0,
    trending: 0,
  };

  const { data: session } = useQuery(user.getSessionQueryOptions);
  const { enabled: trackReading } = useTrackReadingHistory();
  const signedIn = Boolean(session?.user);
  const loginSearch = useLoginSearch();

  useEffect(() => {
    if (trackReading || filter !== "unread") return;
    void navigate({ search: { filter: "subscriptions" } });
  }, [filter, navigate, trackReading]);

  useEffect(() => {
    for (const tabFilter of LATEST_FILTERS) {
      if (tabFilter === "unread" && !trackReading) continue;
      void queryClient.prefetchQuery(
        feedApi.getLatestFeedQueryOptions({
          filter: tabFilter,
          limit: latestFeedPageSize(tabFilter),
          offset: 0,
        }),
      );
    }
  }, [queryClient, trackReading]);

  const onFilterChange = (keys: Set<React.Key> | "all") => {
    const next = keys === "all" ? "all" : ([...keys][0] as LatestFilter);
    void navigate({ search: { filter: next }, resetScroll: false });
  };

  const { mutate: markAllRead, isPending: markingAllRead } = useMutation({
    ...readerApi.markFollowsAllUnreadReadMutationOptions(),
    onMutate: () => {
      applyMarkReadManyOptimisticUpdate(queryClient, [], {
        clearAllFollowingUnread: true,
      });
    },
    onError: () => {
      invalidateReadQueries(queryClient);
    },
  });

  const allCount = formatCount(counts.all);
  const trendingCount = formatCount(
    Math.min(counts.trending, TRENDING_PAGE_LIMIT),
  );
  const unreadLabel = `Unread (${counts.unread})`;
  const subscriptionsLabel = `Subscriptions (${counts.subscriptions})`;
  const allLabel = `All (${allCount})`;
  const trendingLabel = `Trending (${trendingCount})`;

  const isTrending = filter === "trending";
  const isNetwork = !signedIn || filter === "all" || isTrending;

  const metaValue = isTrending
    ? `${trendingCount} articles`
    : isNetwork
      ? `${allCount} articles`
      : filter === "unread"
        ? `${counts.unread} unread`
        : `${counts.subscriptions} articles`;

  const skeletonRows = Math.min(pageSize, SKELETON_ROWS);

  return (
    <ReaderContent>
      <Masthead
        kicker={
          isTrending || isNetwork ? "Across the network" : "From your follows"
        }
        title={isTrending ? "Trending" : "Latest"}
        dek={
          isTrending
            ? "Articles gaining attention across the network right now."
            : isNetwork
              ? "Everything published recently across the whole network."
              : "Everything published recently across the publications you follow."
        }
        metaLabel={isTrending || isNetwork ? "On the network" : "In your feed"}
        metaValue={metaValue}
      />

      <div {...stylex.props(styles.controls)}>
        {signedIn ? (
          <SegmentedControl
            selectedKeys={new Set([filter])}
            onSelectionChange={onFilterChange}
            size="lg"
          >
            {trackReading ? (
              <SegmentedControlItem id="unread">
                {unreadLabel}
              </SegmentedControlItem>
            ) : null}
            <SegmentedControlItem id="subscriptions">
              {subscriptionsLabel}
            </SegmentedControlItem>
            <SegmentedControlItem id="all">{allLabel}</SegmentedControlItem>
            <SegmentedControlItem id="trending">
              {trendingLabel}
            </SegmentedControlItem>
          </SegmentedControl>
        ) : (
          <Flex>
            <Link to="/login" search={loginSearch}>
              <Button variant="secondary">Log in to follow publications</Button>
            </Link>
          </Flex>
        )}
        {trackReading &&
        signedIn &&
        filter === "unread" &&
        counts.unread > 0 ? (
          <Button
            variant="tertiary"
            size="sm"
            isPending={markingAllRead}
            onPress={() => markAllRead()}
          >
            Mark all as read
          </Button>
        ) : null}
      </div>

      <Suspense
        key={filter}
        fallback={<LatestFeedSkeleton rows={skeletonRows} />}
      >
        <LatestFeedPanel filter={filter} />
      </Suspense>
    </ReaderContent>
  );
}
