"use client";

import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { Menu, MenuItem } from "@standard-reader/design-system/menu";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@standard-reader/design-system/segmented-control";
import { Select, SelectItem } from "@standard-reader/design-system/select";
import { Skeleton } from "@standard-reader/design-system/skeleton";
import {
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from "@standard-reader/design-system/tabs";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { ArrowDownWideNarrow, LayoutGrid, List } from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";

import { usePullToRefresh } from "#/components/reader/pull-to-refresh";
import { topicsApi } from "#/integrations/tanstack-query/api-topics.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { SITE_NAME, siteSocialMeta } from "#/lib/site-metadata";
import { useDelayedLoading } from "#/lib/use-delayed-loading";
import { useFormatters } from "#/lib/use-formatters";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";

import {
  ArticleRow,
  PubCardSkeleton,
  PubDirectoryRowSkeleton,
} from "../components/reader/cards";
import { FeedLoadMore } from "../components/reader/feed-load-more";
import { Kicker, ReaderContent } from "../components/reader/primitives";
import { PubGridList } from "../components/reader/pub-grid-list";
import { isArticleUnreadForReader } from "../components/reader/read-optimistic";
import type { ArticleCard } from "../integrations/tanstack-query/api-shapes";

const PAGE_SIZE = 24;
const SKELETON_COUNT = 8;
const LOAD_MORE_SKELETON_COUNT = 3;
const ARTICLE_SKELETON_ROWS = 8;
/** Grace period before tab skeletons appear (avoids flash on fast loads). */
const TAB_SKELETON_DELAY_MS = 150;
/**
 * Sub-area links under the masthead.
 *
 * The query returns up to 40 — enough for search and for the tabs below — but
 * a masthead is not a tag cloud. Twelve is roughly two wrapped lines at the
 * narrowest layout, which is a footnote; the rest stay reachable through the
 * articles they tag.
 */
const SUB_AREA_LINKS = 12;

const topicSearchShape = z.object({
  view: z.enum(["feed", "publications"]).default("feed"),
  /** Publications-tab ranking. */
  sort: z.enum(["belonging", "readers", "active", "az"]).default("belonging"),
  /** Articles-tab ranking — kept apart from `sort` so the tabs hold
   * independent state in the URL. */
  articleSort: z.enum(["recent", "trending", "popular"]).default("recent"),
  layout: z.enum(["grid", "list"]).default("list"),
});

type TopicSearch = z.infer<typeof topicSearchShape>;
type TopicView = TopicSearch["view"];
type TopicSort = TopicSearch["sort"];
type TopicArticleSort = TopicSearch["articleSort"];

const ARTICLE_SORT_OPTIONS = [
  { id: "recent", label: msg`Newest` },
  { id: "trending", label: msg`Trending` },
  { id: "popular", label: msg`Most liked` },
] as const;

const SORT_OPTIONS = [
  { id: "belonging", label: msg`Best fit` },
  { id: "readers", label: msg`Readers` },
  { id: "active", label: msg`Active` },
  { id: "az", label: msg`A–Z` },
] as const;

export const Route = createFileRoute("/_layout/topics/$slug")({
  validateSearch: topicSearchShape,
  staleTime: 60_000,
  loaderDeps: ({ search }) => ({
    view: search.view,
    sort: search.sort,
    articleSort: search.articleSort,
  }),
  loader: async ({ context, params, deps }) => {
    const page = await topicsApi.getTopicPage({
      data: {
        slug: params.slug,
        view: deps.view,
        sort: deps.sort,
        articleSort: deps.articleSort,
        limit: PAGE_SIZE,
        offset: 0,
      },
    });
    if (!page.topic) {
      // A slug the table has never held is a real 404. One it has — a topic
      // that dissolved into another, or fell below the quality bar — was a
      // public link once, so it redirects instead: to whichever topic absorbed
      // it, or to the index when nothing did.
      if (!page.redirect?.known) throw notFound();
      throw redirect(
        page.redirect.slug
          ? {
              to: "/topics/$slug",
              params: { slug: page.redirect.slug },
              statusCode: 301,
            }
          : { to: "/topics", statusCode: 301 },
      );
    }

    topicsApi.seedTopicPageCaches(context.queryClient, page, {
      slug: params.slug,
      view: deps.view,
      sort: deps.sort,
      articleSort: deps.articleSort,
      limit: PAGE_SIZE,
      offset: 0,
    });
    return {
      name: page.topic.name,
      description: page.topic.description,
    };
  },
  head: ({ loaderData, params }) => {
    const baseUrl = getPublicUrlClient();
    const name = loaderData?.name ?? params.slug;
    const title = `${name} · ${SITE_NAME}`;
    return {
      meta: siteSocialMeta({
        title,
        description:
          loaderData?.description ??
          `Publications and articles across ${name} on the Atmosphere.`,
        url: `${baseUrl.replace(/\/$/, "")}/topics/${params.slug}`,
      }),
    };
  },
  component: TopicPage,
});

/* ── Articles tab ─────────────────────────────────────────────────────────── */

function TopicArticlesSkeleton({ rows = ARTICLE_SKELETON_ROWS }) {
  const { t } = useLingui();
  return (
    <div aria-busy="true" aria-label={t`Loading articles`}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} {...stylex.props(styles.articleSkeletonRow)}>
          <Skeleton variant="rectangle" height={spacing["5"]} width="62%" />
          <Skeleton variant="rectangle" height={spacing["4"]} width="38%" />
        </div>
      ))}
    </div>
  );
}

function TopicArticlesPanel({
  slug,
  articleSort,
}: {
  slug: string;
  articleSort: TopicArticleSort;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const { enabled: trackReading } = useTrackReadingHistory();

  const {
    data: feed,
    isPending: feedPending,
    isFetching: feedFetching,
  } = useQuery({
    ...topicsApi.getArticlesQueryOptions({
      slug,
      articleSort,
      limit: PAGE_SIZE,
      offset: 0,
    }),
    placeholderData: (previousData, previousQuery) => {
      // Only keep the previous page when it belongs to this topic —
      // otherwise navigating between topics flashes the old one's rows.
      if (previousQuery?.queryKey[2] === slug) {
        return keepPreviousData(previousData);
      }
      return;
    },
  });

  const [loadedMore, setLoadedMore] = useState<Array<ArticleCard>>([]);
  const [loadedMoreNextOffset, setLoadedMoreNextOffset] = useState<
    number | null
  >(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setLoadedMore([]);
    setLoadedMoreNextOffset(null);
  }, [slug, articleSort]);

  const items = useMemo(
    () => [...(feed?.items ?? []), ...loadedMore],
    [feed?.items, loadedMore],
  );
  const nextOffset =
    loadedMore.length > 0 ? loadedMoreNextOffset : (feed?.nextOffset ?? null);

  const isLoading = feedPending || (feedFetching && items.length === 0);
  const showSkeleton = useDelayedLoading(isLoading, TAB_SKELETON_DELAY_MS);

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await topicsApi.getArticles({
        data: { slug, articleSort, limit: PAGE_SIZE, offset: nextOffset },
      });
      setLoadedMore((prev) => [...prev, ...page.items]);
      setLoadedMoreNextOffset(page.nextOffset);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [articleSort, nextOffset, slug]);

  if (showSkeleton) return <TopicArticlesSkeleton />;
  // Inside the grace period keep the chrome steady rather than flashing the
  // empty state.
  if (isLoading) {
    return <div aria-busy="true" aria-label={t`Loading articles`} />;
  }

  if (items.length === 0) {
    return (
      <p {...stylex.props(styles.empty)}>
        <Trans>No articles in this topic yet.</Trans>
      </p>
    );
  }

  return (
    <>
      <div>
        {items.map((article, index) => (
          <ArticleRow
            key={article.uri}
            article={article}
            isFirstInSection={index === 0}
            unread={isArticleUnreadForReader(queryClient, article, {
              trackReading,
              signedIn,
            })}
            showSaveButton={false}
          />
        ))}
      </div>

      <FeedLoadMore
        hasMore={nextOffset != null}
        isLoading={loadingMore}
        onLoadMore={() => void loadMore()}
        itemCount={items.length}
      />
      {loadingMore ? (
        <TopicArticlesSkeleton rows={LOAD_MORE_SKELETON_COUNT} />
      ) : nextOffset == null ? (
        <p {...stylex.props(styles.endNote)}>
          <Trans>You&apos;ve reached the end.</Trans>
        </p>
      ) : null}
    </>
  );
}

/* ── Publications tab ─────────────────────────────────────────────────────── */

function TopicDirectorySkeleton({
  layout,
  count = SKELETON_COUNT,
}: {
  layout: "grid" | "list";
  count?: number;
}) {
  const { t } = useLingui();

  if (layout === "grid") {
    return (
      <div
        aria-busy="true"
        aria-label={t`Loading publications`}
        {...stylex.props(styles.directoryGrid)}
      >
        {Array.from({ length: count }, (_, index) => (
          <PubCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  return (
    <div aria-busy="true" aria-label={t`Loading publications`}>
      {Array.from({ length: count }, (_, index) => (
        <PubDirectoryRowSkeleton key={index} isLast={index === count - 1} />
      ))}
    </div>
  );
}

function TopicPublicationsPanel({
  slug,
  sort,
  layout,
}: {
  slug: string;
  sort: TopicSort;
  layout: "grid" | "list";
}) {
  const { t, i18n } = useLingui();
  const navigate = useNavigate({ from: Route.fullPath });

  const {
    data: directory,
    isPending,
    isFetching,
  } = useQuery({
    ...topicsApi.getPublicationsQueryOptions({
      slug,
      sort,
      limit: PAGE_SIZE,
      offset: 0,
    }),
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.queryKey[2] === slug) {
        return keepPreviousData(previousData);
      }
      return;
    },
  });

  const [loadedMore, setLoadedMore] = useState<
    Array<NonNullable<typeof directory>["items"][number]>
  >([]);
  const [loadedMoreNextOffset, setLoadedMoreNextOffset] = useState<
    number | null
  >(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setLoadedMore([]);
    setLoadedMoreNextOffset(null);
  }, [slug, sort]);

  const items = useMemo(
    () => [...(directory?.items ?? []), ...loadedMore],
    [directory?.items, loadedMore],
  );
  const nextOffset =
    loadedMore.length > 0
      ? loadedMoreNextOffset
      : (directory?.nextOffset ?? null);

  const isLoading = isPending || (isFetching && items.length === 0);
  const showSkeleton = useDelayedLoading(isLoading, TAB_SKELETON_DELAY_MS);

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await topicsApi.getPublications({
        data: { slug, sort, limit: PAGE_SIZE, offset: nextOffset },
      });
      setLoadedMore((prev) => [...prev, ...page.items]);
      setLoadedMoreNextOffset(page.nextOffset);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [nextOffset, slug, sort]);

  const updateSearch = (patch: Partial<TopicSearch>) => {
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev: TopicSearch) => ({ ...prev, ...patch }),
    });
  };

  return (
    <>
      {/* Toolbar stays mounted through loading — only the rows below swap for
          a skeleton, so the controls never jump. */}
      <div {...stylex.props(styles.directoryToolbar)}>
        <SegmentedControl
          selectedKeys={new Set([sort])}
          onSelectionChange={(keys) => {
            const next = String([...keys][0] ?? "belonging") as TopicSort;
            updateSearch({ sort: next });
          }}
          size="sm"
        >
          {SORT_OPTIONS.map((option) => (
            <SegmentedControlItem key={option.id} id={option.id}>
              {i18n._(option.label)}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>

        <SegmentedControl
          selectedKeys={new Set([layout])}
          onSelectionChange={(keys) => {
            const next = String([...keys][0] ?? "list") as "grid" | "list";
            updateSearch({ layout: next });
          }}
          size="sm"
        >
          <SegmentedControlItem id="list" aria-label={t`List view`}>
            <List size={16} />
          </SegmentedControlItem>
          <SegmentedControlItem id="grid" aria-label={t`Grid view`}>
            <LayoutGrid size={16} />
          </SegmentedControlItem>
        </SegmentedControl>
      </div>

      {showSkeleton ? (
        <TopicDirectorySkeleton layout={layout} />
      ) : isLoading ? (
        <div aria-busy="true" aria-label={t`Loading publications`} />
      ) : items.length === 0 ? (
        <p {...stylex.props(styles.empty)}>
          <Trans>No publications in this topic yet.</Trans>
        </p>
      ) : (
        <PubGridList
          pubs={items}
          layout={layout}
          variant={layout === "grid" ? "card" : "row"}
          aria-label={t`Publications`}
        />
      )}

      {items.length > 0 && !showSkeleton ? (
        <>
          <FeedLoadMore
            hasMore={nextOffset != null}
            isLoading={loadingMore}
            onLoadMore={() => void loadMore()}
            itemCount={items.length}
          />
          {loadingMore ? (
            <TopicDirectorySkeleton
              layout={layout}
              count={LOAD_MORE_SKELETON_COUNT}
            />
          ) : nextOffset == null ? (
            <p {...stylex.props(styles.endNote)}>
              <Trans>You&apos;ve reached the end.</Trans>
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

function TopicPage() {
  usePullToRefresh();
  const { t, i18n } = useLingui();
  const fmt = useFormatters();
  const { slug } = Route.useParams();
  const { view, sort, articleSort, layout } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const routePending = useRouterState({ select: (state) => state.isLoading });
  const queryClient = useQueryClient();
  const [pendingViews, setPendingViews] = useState<
    Partial<Record<string, TopicView>>
  >({});

  const { data: topic } = useSuspenseQuery(
    topicsApi.getTopicQueryOptions({ slug }),
  );
  const { data: publicationCount = 0 } = useSuspenseQuery(
    topicsApi.getPublicationCountQueryOptions({ slug }),
  );

  // Warm the tab the reader hasn't opened, once the critical path is idle.
  useEffect(() => {
    if (routePending) return;

    const prefetchOtherTab = () => {
      if (view === "feed") {
        void queryClient.prefetchQuery(
          topicsApi.getPublicationsQueryOptions({
            slug,
            sort,
            limit: PAGE_SIZE,
            offset: 0,
          }),
        );
        return;
      }
      void queryClient.prefetchQuery(
        topicsApi.getArticlesQueryOptions({
          slug,
          articleSort,
          limit: PAGE_SIZE,
          offset: 0,
        }),
      );
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

    const idleId = scheduleIdle(prefetchOtherTab);
    return () => cancelIdle(idleId);
  }, [articleSort, queryClient, routePending, slug, sort, view]);

  const pendingView = pendingViews[slug] ?? null;
  const activeView = routePending ? (pendingView ?? view) : view;
  const isFeed = activeView === "feed";

  const onViewChange = (key: React.Key) => {
    const next = key as TopicView;
    // Highlight the tab immediately; the loader catches up.
    if (next !== view) {
      setPendingViews((prev) => ({ ...prev, [slug]: next }));
    }
    void navigate({
      search: (prev: TopicSearch) => ({ ...prev, view: next }),
    });
  };

  const onArticleSortChange = (key: React.Key | null) => {
    if (key == null) return;
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev: TopicSearch) => ({
        ...prev,
        articleSort: String(key) as TopicArticleSort,
      }),
    });
  };

  if (!topic) return null;

  const subAreas = topic.tags.slice(0, SUB_AREA_LINKS);

  return (
    <div>
      <div {...stylex.props(styles.heroInner)}>
        <div {...stylex.props(styles.heroInfo)}>
          <Kicker>
            <Trans>Topic</Trans>
          </Kicker>
          {/* Topic names are model-authored data, not UI copy — never
              wrapped in a macro, and `dir="auto"` since many are not English. */}
          <h1 dir="auto" {...stylex.props(styles.heroName)}>
            {topic.name}
          </h1>
          {topic.description ? (
            <p dir="auto" {...stylex.props(styles.heroDesc)}>
              {topic.description}
            </p>
          ) : null}

          <div {...stylex.props(styles.stats)}>
            <span>
              <span {...stylex.props(styles.statValue)}>
                {fmt.compactNumber(publicationCount)}
              </span>
              <Plural
                value={publicationCount}
                one="publication"
                other="publications"
              />
            </span>
            <span>
              <span {...stylex.props(styles.statValue)}>
                {fmt.compactNumber(topic.authorCount)}
              </span>
              <Plural value={topic.authorCount} one="writer" other="writers" />
            </span>
          </div>

          {/* The tags this topic was clustered from. Each still has its
              own page, so this is the way back down to a narrower view — but
              it is a footnote to the masthead, not a second headline. Forty
              bordered chips read as a tag cloud and pulled the eye off the
              name; a wrapped line of plain links says the same thing quietly,
              and {@link SUB_AREA_LINKS} keeps it to one or two lines. */}
          {subAreas.length > 0 ? (
            <p {...stylex.props(styles.subAreas)}>
              {subAreas.map((tag, index) => (
                <Fragment key={tag}>
                  {index > 0 ? (
                    <span aria-hidden {...stylex.props(styles.subAreaSep)}>
                      ·
                    </span>
                  ) : null}
                  <Link
                    to="/tag/$tag"
                    params={{ tag }}
                    dir="auto"
                    {...stylex.props(styles.subAreaLink)}
                  >
                    {tag}
                  </Link>
                </Fragment>
              ))}
            </p>
          ) : null}
        </div>
      </div>

      <Tabs
        selectedKey={activeView}
        onSelectionChange={onViewChange}
        style={styles.tabs}
      >
        <div {...stylex.props(styles.tabBar)}>
          <div {...stylex.props(styles.tabBarInner)}>
            <TabList aria-label={t`Topic views`} style={styles.tabList}>
              <Tab id="feed">
                <Trans>Articles</Trans>
              </Tab>
              <Tab id="publications">
                <Trans>Publications</Trans>
              </Tab>
            </TabList>

            {isFeed ? (
              <>
                <div
                  {...stylex.props(styles.tabBarSort, styles.tabBarSortCompact)}
                >
                  <Menu
                    placement="bottom end"
                    selectionMode="single"
                    selectedKeys={new Set([articleSort])}
                    onSelectionChange={(keys) => {
                      if (keys === "all") return;
                      onArticleSortChange([...keys][0] ?? null);
                    }}
                    trigger={
                      <IconButton
                        aria-label={t`Sort articles`}
                        size="md"
                        variant="secondary"
                      >
                        <ArrowDownWideNarrow size={16} />
                      </IconButton>
                    }
                  >
                    {ARTICLE_SORT_OPTIONS.map((option) => (
                      <MenuItem key={option.id} id={option.id}>
                        {i18n._(option.label)}
                      </MenuItem>
                    ))}
                  </Menu>
                </div>

                <div
                  {...stylex.props(styles.tabBarSort, styles.tabBarSortFull)}
                >
                  <Select
                    aria-label={t`Sort articles`}
                    size="md"
                    variant="secondary"
                    prefix={<ArrowDownWideNarrow size={14} aria-hidden />}
                    selectedKey={articleSort}
                    style={styles.tabBarSortSelect}
                    onSelectionChange={onArticleSortChange}
                  >
                    {ARTICLE_SORT_OPTIONS.map((option) => (
                      <SelectItem
                        key={option.id}
                        id={option.id}
                        textValue={i18n._(option.label)}
                      >
                        {i18n._(option.label)}
                      </SelectItem>
                    ))}
                  </Select>
                </div>
              </>
            ) : null}
          </div>
          <div {...stylex.props(styles.tabRule)} aria-hidden />
        </div>

        <ReaderContent>
          {/* Only the active panel renders its content — a mounted inactive
              panel would run its query on every load. */}
          <TabPanel id="feed" style={styles.tabPanel}>
            {isFeed ? (
              <TopicArticlesPanel slug={slug} articleSort={articleSort} />
            ) : null}
          </TabPanel>
          <TabPanel id="publications" style={styles.tabPanel}>
            {isFeed ? null : (
              <TopicPublicationsPanel slug={slug} sort={sort} layout={layout} />
            )}
          </TabPanel>
        </ReaderContent>
      </Tabs>
    </div>
  );
}

const styles = stylex.create({
  heroInner: {
    alignItems: "flex-start",
    boxSizing: "border-box",
    columnGap: spacing["5"],
    display: "flex",
    flexWrap: "wrap",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    paddingInlineEnd: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingInlineStart: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    rowGap: spacing["4"],
    maxWidth: "82.5rem",
    paddingBottom: spacing["0"],
    paddingTop: spacing["6"],
    width: "100%",
  },
  heroInfo: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: "15rem",
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
    fontWeight: fontWeight.semibold,
    marginInlineEnd: spacing["1.5"],
  },
  subAreas: {
    lineHeight: lineHeight.base,
    marginBottom: spacing["0"],
    maxWidth: "72ch",
    marginTop: spacing["5"],
  },
  subAreaSep: {
    color: uiColor.text1,
    marginInlineEnd: spacing["1.5"],
    marginInlineStart: spacing["1.5"],
    opacity: 0.5,
  },
  subAreaLink: {
    color: {
      default: uiColor.text1,
      ":hover": uiColor.text2,
    },
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    textDecorationColor: uiColor.border2,
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
    // Single-line tag link: isolate so bidi text keeps its own ordering
    // without dragging the surrounding line around.
    unicodeBidi: "isolate",
  },
  tabs: {
    marginTop: spacing["6"],
  },
  tabBar: {
    position: "relative",
  },
  tabBarInner: {
    alignItems: "center",
    boxSizing: "border-box",
    display: "flex",
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    paddingInlineEnd: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingInlineStart: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    maxWidth: "82.5rem",
    width: "100%",
  },
  tabList: {
    flexShrink: 0,
  },
  tabBarSort: {
    marginInlineStart: "auto",
  },
  tabBarSortCompact: {
    display: { default: "block", "@media (min-width: 40rem)": "none" },
  },
  tabBarSortFull: {
    display: { default: "none", "@media (min-width: 40rem)": "block" },
  },
  tabBarSortSelect: {
    width: spacing["40"],
  },
  tabRule: {
    backgroundColor: uiColor.border1,
    bottom: 0,
    height: 1,
    insetInlineEnd: 0,
    insetInlineStart: 0,
    position: "absolute",
  },
  tabPanel: {
    paddingTop: spacing["6"],
  },
  directoryToolbar: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-between",
    columnGap: spacing["3"],
    rowGap: spacing["3"],
    marginBottom: spacing["6"],
  },
  directoryGrid: {
    columnGap: spacing["6"],
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    rowGap: spacing["6"],
  },
  articleSkeletonRow: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexDirection: "column",
    rowGap: spacing["2"],
    paddingBottom: spacing["5"],
    paddingTop: spacing["5"],
  },
  empty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    marginTop: spacing["4"],
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
