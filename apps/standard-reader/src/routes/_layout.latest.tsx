"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
  AlertDialog,
  AlertDialogActionButton,
  AlertDialogCancelButton,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@standard-reader/design-system/alert-dialog";
import { Button } from "@standard-reader/design-system/button";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@standard-reader/design-system/segmented-control";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCheck } from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";

import { ButtonLink } from "#/components/router-links";
import {
  TRENDING_PAGE_LIMIT,
  feedApi,
  latestFeedPageSize,
} from "#/integrations/tanstack-query/api-feed.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { latestControlsVisibility } from "#/lib/latest-feed-controls";
import { getPublicUrlClient } from "#/lib/public-url";
import { latestFeedUrl, pageSocialMeta } from "#/lib/site-metadata";
import { useFormatters } from "#/lib/use-formatters";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";
import { useLoginSearch } from "#/utils/use-login-search";

import { ArticleRow } from "../components/reader/cards";
import { FeedLoadMore } from "../components/reader/feed-load-more";
import { Masthead, ReaderContent } from "../components/reader/primitives";
import {
  applyMarkReadManyOptimisticUpdate,
  invalidateReadQueries,
  isArticleUnreadForReader,
} from "../components/reader/read-optimistic";
import { RssFeedButton } from "../components/reader/rss-feed-button";
import type {
  LatestFeedCounts,
  LatestFilter,
} from "../integrations/tanstack-query/api-feed.functions";
import type { ArticleCard } from "../integrations/tanstack-query/api-shapes";

const SKELETON_ROWS = 8;

const latestSearchSchema = z.object({
  filter: z
    .enum(["unread", "subscriptions", "all", "trending"])
    .default("unread"),
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
  loader: async ({ context, deps, preload }) => {
    const session = context.queryClient.getQueryData(
      user.getSessionQueryOptions.queryKey,
    );
    const readerScope = user.readerQueryScope(session);
    const feedOptions = feedApi.getLatestFeedQueryOptions({
      filter: deps.filter,
      limit: latestFeedPageSize(deps.filter),
      offset: 0,
      readerScope,
    });
    const countsOptions = feedApi.getLatestFeedCountsQueryOptions(readerScope);

    if (preload) {
      void context.queryClient.prefetchQuery(countsOptions);
      void context.queryClient.prefetchQuery(feedOptions);
      return { readerScope };
    }

    await Promise.all([
      context.queryClient.ensureQueryData(feedOptions),
      context.queryClient.ensureQueryData(countsOptions),
    ]);
    return { readerScope };
  },
  head: ({ loaderData }) => {
    const baseUrl = getPublicUrlClient();
    const did = loaderData?.readerScope;
    return {
      meta: pageSocialMeta("latest", baseUrl),
      links:
        did && did !== "guest"
          ? [
              {
                rel: "alternate",
                type: "application/rss+xml",
                title: "Your Latest · Standard Reader",
                href: latestFeedUrl(baseUrl, did),
              },
            ]
          : [],
    };
  },
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
    paddingInlineEnd: spacing["8"],
    paddingInlineStart: spacing["8"],
    marginTop: spacing["6"],
    paddingBottom: spacing["10"],
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
  endNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.sm,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: spacing["6"],
  },
  tabLabel: {
    alignItems: "center",
    columnGap: spacing["1.5"],
    display: "inline-flex",
    rowGap: spacing["1.5"],
  },
  tabCountSkeleton: {
    flexShrink: 0,
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
  const { t } = useLingui();
  return (
    <div aria-busy="true" aria-label={t`Loading articles`}>
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

function LatestTabLabel({
  name,
  count,
  pending,
  formatCountValue = String,
}: {
  name: string;
  count: number;
  pending: boolean;
  formatCountValue?: (value: number) => string;
}) {
  return (
    <span {...stylex.props(styles.tabLabel)}>
      {name}
      {pending ? (
        <Skeleton
          variant="rectangle"
          height={spacing["4"]}
          width={spacing["10"]}
          style={styles.tabCountSkeleton}
        />
      ) : (
        ` (${formatCountValue(count)})`
      )}
    </span>
  );
}

function LatestFeedPanel({
  filter,
  counts,
  countsPending,
  readerScope,
}: {
  filter: LatestFilter;
  counts: LatestFeedCounts;
  countsPending: boolean;
  readerScope: string;
}) {
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const pageSize = latestFeedPageSize(filter);

  const { data: feed } = useSuspenseQuery({
    ...feedApi.getLatestFeedQueryOptions({
      filter,
      limit: pageSize,
      offset: 0,
      readerScope,
    }),
    refetchOnMount: false,
  });

  const [extraItems, setExtraItems] = useState<Array<ArticleCard>>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(feed.nextOffset);
  const [loadingMore, setLoadingMore] = useState(false);
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

  // Cache-aware so the dot clears the moment an article is optimistically marked
  // read (visiting it, or "mark as read"), even on the unread filter where every
  // row was unread when the page loaded. Reading `isRead` alone would keep the dot
  // on until a refetch; the optimistic read-status cache flips first.
  const isUnread = (article: ArticleCard) =>
    isArticleUnreadForReader(queryClient, article, { trackReading, signedIn });

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

  const isTrending = filter === "trending";
  const isNetwork = !signedIn || filter === "all" || isTrending;

  if (items.length === 0) {
    if (countsPending && signedIn && !isNetwork && !isTrending) {
      return <LatestFeedSkeleton rows={3} />;
    }

    return (
      <>
        {isTrending ? (
          <Flex direction="column" gap="2xl" style={styles.emptyCard}>
            <span {...stylex.props(styles.emptyTitle)}>
              <Trans>Nothing trending yet</Trans>
            </span>
            <span {...stylex.props(styles.emptyDek)}>
              <Trans>
                No articles are trending across the network right now. Check
                back soon.
              </Trans>
            </span>
          </Flex>
        ) : isNetwork ? (
          <Flex direction="column" gap="2xl" style={styles.emptyCard}>
            <span {...stylex.props(styles.emptyTitle)}>
              <Trans>Nothing here yet</Trans>
            </span>
            <span {...stylex.props(styles.emptyDek)}>
              <Trans>
                Nothing has been published across the network recently.
              </Trans>
            </span>
          </Flex>
        ) : counts.subscriptions === 0 ? (
          <Flex direction="column" gap="2xl" style={styles.emptyCard}>
            <span {...stylex.props(styles.emptyTitle)}>
              <Trans>Nothing here yet</Trans>
            </span>
            <span {...stylex.props(styles.emptyDek)}>
              <Trans>
                Follow a few publications and their latest writing will show up
                here.
              </Trans>
            </span>
            <Flex>
              <ButtonLink to="/discover">
                <Trans>Explore the directory</Trans>
              </ButtonLink>
            </Flex>
          </Flex>
        ) : (
          <Flex direction="column" gap="2xl" style={styles.emptyCard}>
            <span {...stylex.props(styles.emptyTitle)}>
              <Trans>All caught up</Trans>
            </span>
            <span {...stylex.props(styles.emptyDek)}>
              <Trans>No unread articles from your follows right now.</Trans>
            </span>
            <Flex>
              <Button
                variant="secondary"
                onPress={() =>
                  void navigate({ search: { filter: "subscriptions" } })
                }
              >
                <Trans>Show all subscriptions</Trans>
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
            unread={isUnread(article)}
            showSaveButton={false}
            isFirstInSection={index === 0}
          />
        ))}
      </div>

      {nextOffset == null ? (
        <p {...stylex.props(styles.endNote)}>
          <Trans>You&apos;ve reached the end.</Trans>
        </p>
      ) : (
        <>
          <FeedLoadMore
            hasMore
            isLoading={loadingMore}
            onLoadMore={() => void loadMoreFeed()}
            itemCount={items.length}
          />
          {loadingMore ? <LatestFeedSkeleton rows={3} /> : null}
        </>
      )}
    </>
  );
}

function Latest() {
  const { t } = useLingui();
  const fmt = useFormatters();
  const { filter } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const pageSize = latestFeedPageSize(filter);

  const { data: session } = useQuery(user.getSessionQueryOptions);
  const readerScope = user.readerQueryScope(session);

  const {
    data: tabCounts,
    isPending: countsQueryPending,
    isFetching: countsFetching,
  } = useQuery({
    ...feedApi.getLatestFeedCountsQueryOptions(readerScope),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const counts = tabCounts ?? {
    unread: 0,
    subscriptions: 0,
    all: 0,
    trending: 0,
  };
  const countsPending =
    tabCounts == null && (countsQueryPending || countsFetching);

  const { enabled: trackReading } = useTrackReadingHistory();
  const signedIn = Boolean(session?.user);
  const loginSearch = useLoginSearch();

  // With reading history off there is no Unread tab, so `?filter=unread` is a
  // URL to normalise away, not a page the reader chose. `replace` keeps it out
  // of history — a pushed entry makes Back bounce off this effect forever.
  useEffect(() => {
    if (trackReading || filter !== "unread") return;
    void navigate({ replace: true, search: { filter: "subscriptions" } });
  }, [filter, navigate, trackReading]);

  useEffect(() => {
    // Signed-out readers only see the active feed (no tab switcher) — prefetching
    // other filters fires duplicate network-wide queries and extra count scans.
    if (!signedIn) return;

    const prefetchTabs = () => {
      void queryClient.prefetchQuery(
        feedApi.getLatestFeedCountsQueryOptions(readerScope),
      );
      for (const tabFilter of LATEST_FILTERS) {
        if (tabFilter === filter) continue;
        if (tabFilter === "unread" && !trackReading) continue;
        void queryClient.prefetchQuery(
          feedApi.getLatestFeedQueryOptions({
            filter: tabFilter,
            limit: latestFeedPageSize(tabFilter),
            offset: 0,
            readerScope,
          }),
        );
      }
    };

    const scheduleIdle =
      globalThis.requestIdleCallback ??
      ((callback: IdleRequestCallback) =>
        globalThis.setTimeout(
          () => callback({ didTimeout: false, timeRemaining: () => 0 }),
          200,
        ));

    const cancelIdle =
      globalThis.cancelIdleCallback ??
      ((id: number) => globalThis.clearTimeout(id));

    const idleId = scheduleIdle(prefetchTabs);
    return () => cancelIdle(idleId);
  }, [filter, queryClient, readerScope, signedIn, trackReading]);

  const onFilterChange = (keys: Set<React.Key> | "all") => {
    const next = keys === "all" ? "all" : ([...keys][0] as LatestFilter);
    void navigate({ search: { filter: next }, resetScroll: false });
  };

  const [markAllReadOpen, setMarkAllReadOpen] = useState(false);
  const { mutate: markAllRead, isPending: markingAllRead } = useMutation({
    ...readerApi.markFollowsAllUnreadReadMutationOptions(),
    onMutate: () => {
      applyMarkReadManyOptimisticUpdate(queryClient, [], {
        clearAllFollowingUnread: true,
      });
    },
    onSuccess: () => {
      setMarkAllReadOpen(false);
    },
    onError: () => {
      invalidateReadQueries(queryClient);
    },
  });

  const unreadLabel = (
    <LatestTabLabel
      name={t`Unread`}
      count={counts.unread}
      pending={countsPending}
      formatCountValue={fmt.compactNumber}
    />
  );
  const subscriptionsLabel = (
    <LatestTabLabel
      name={t`Subscriptions`}
      count={counts.subscriptions}
      pending={countsPending}
      formatCountValue={fmt.compactNumber}
    />
  );
  const allLabel = (
    <LatestTabLabel
      name={t`All`}
      count={counts.all}
      pending={countsPending}
      formatCountValue={fmt.compactNumber}
    />
  );
  const trendingLabel = (
    <LatestTabLabel
      name={t`Trending`}
      count={Math.min(counts.trending, TRENDING_PAGE_LIMIT)}
      pending={countsPending}
      formatCountValue={fmt.compactNumber}
    />
  );

  const isTrending = filter === "trending";
  const isNetwork = !signedIn || filter === "all" || isTrending;

  const { showRssFeed, showMarkAllRead, markAllReadDisabled } =
    latestControlsVisibility({
      countsPending,
      filter,
      signedIn,
      trackReading,
      unreadCount: counts.unread,
    });

  const trendingCount = Math.min(counts.trending, TRENDING_PAGE_LIMIT);
  const metaCount = isTrending
    ? trendingCount
    : isNetwork
      ? counts.all
      : filter === "unread"
        ? counts.unread
        : counts.subscriptions;
  const formattedMetaCount = fmt.compactNumber(metaCount);
  const metaValueText =
    !isTrending && !isNetwork && filter === "unread" ? (
      <Trans>{formattedMetaCount} unread</Trans>
    ) : (
      <Plural
        value={metaCount}
        one={`${formattedMetaCount} article`}
        other={`${formattedMetaCount} articles`}
      />
    );

  const skeletonRows = Math.min(pageSize, SKELETON_ROWS);

  return (
    <ReaderContent>
      <Masthead
        kicker={
          isTrending || isNetwork
            ? t`Across the network`
            : t`From your subscriptions`
        }
        title={isTrending ? t`Trending` : t`Latest`}
        dek={
          isTrending
            ? t`Articles gaining attention across the network right now.`
            : isNetwork
              ? t`Everything published recently across the whole network.`
              : t`Everything published recently across the publications you subscribe to.`
        }
        metaLabel={
          isTrending || isNetwork ? t`On the network` : t`In your feed`
        }
        metaValue={
          countsPending ? (
            <Skeleton
              variant="rectangle"
              height={spacing["8"]}
              width={spacing["16"]}
            />
          ) : (
            metaValueText
          )
        }
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
            <ButtonLink to="/login" search={loginSearch} variant="secondary">
              <Trans>Log in to follow publications</Trans>
            </ButtonLink>
          </Flex>
        )}
        <Flex align="center" gap="md">
          {showRssFeed ? (
            <RssFeedButton
              name={t`Your Latest`}
              feedUrl={latestFeedUrl(getPublicUrlClient(), readerScope)}
              size="lg"
            />
          ) : null}
          {showMarkAllRead ? (
            <AlertDialog
              isOpen={markAllReadOpen}
              onOpenChange={setMarkAllReadOpen}
              trigger={
                <IconButton
                  variant="secondary"
                  size="lg"
                  isDisabled={markAllReadDisabled}
                  label={t`Mark all as read`}
                >
                  <CheckCheck size={18} />
                </IconButton>
              }
            >
              <AlertDialogHeader>
                <Trans>Mark all as read?</Trans>
              </AlertDialogHeader>
              <AlertDialogDescription>
                <Trans>
                  Every unread article in your subscriptions will be marked
                  read. This can’t be undone.
                </Trans>
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancelButton isDisabled={markingAllRead} />
                <AlertDialogActionButton
                  closeOnPress={false}
                  isPending={markingAllRead}
                  onPress={() => markAllRead()}
                >
                  <Trans>Mark all as read</Trans>
                </AlertDialogActionButton>
              </AlertDialogFooter>
            </AlertDialog>
          ) : null}
        </Flex>
      </div>

      <Suspense
        key={filter}
        fallback={<LatestFeedSkeleton rows={skeletonRows} />}
      >
        <LatestFeedPanel
          filter={filter}
          counts={counts}
          countsPending={countsPending}
          readerScope={readerScope}
        />
      </Suspense>
    </ReaderContent>
  );
}
