"use client";

import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";

import * as stylex from "@stylexjs/stylex";
import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArticleRow,
  PubCard,
  PubCardSkeleton,
  PubDirectoryRow,
  PubDirectoryRowSkeleton,
} from "#/components/reader/cards";
import {
  Kicker,
  ReaderContent,
  SectionHead,
} from "#/components/reader/primitives";
import { tagDisplayTitle } from "#/components/reader/format";
import { Flex } from "#/design-system/flex";
import { Grid } from "#/design-system/grid";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "#/design-system/segmented-control";
import { Skeleton } from "#/design-system/skeleton";
import { Tab, TabList, TabPanel, Tabs } from "#/design-system/tabs";
import { uiColor } from "#/design-system/theme/color.stylex";
import { gap } from "#/design-system/theme/semantic-spacing.stylex";
import { spacing } from "#/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "#/design-system/theme/typography.stylex";
import { tagApi } from "#/integrations/tanstack-query/api-tag.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { formatCount } from "#/lib/format-count";
import { getPublicUrlClient } from "#/lib/public-url";
import { SITE_NAME, siteSocialMeta } from "#/lib/site-metadata";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";
import { LayoutGrid, List, Tag } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import type { TagPublicationCard } from "#/integrations/tanstack-query/api-tag.functions";

const PAGE_SIZE = 24;
const SKELETON_COUNT = 8;
const LOAD_MORE_SKELETON_COUNT = 3;
const ARTICLE_SKELETON_ROWS = 8;

/** Legacy URLs used `view=grid|list` for publication layout before tabs shipped. */
function normalizeTagSearch(search: unknown) {
  if (search == null || typeof search !== "object") {
    return search;
  }
  const raw = search as Record<string, unknown>;
  if (raw.view === "grid" || raw.view === "list") {
    return {
      ...raw,
      view: "publications",
      layout: raw.view,
    };
  }
  return search;
}

const tagSearchShape = z.object({
  view: z.enum(["feed", "publications"]).default("feed"),
  sort: z.enum(["tagged", "readers", "active", "az"]).default("tagged"),
  layout: z.enum(["grid", "list"]).default("list"),
});

const tagSearchSchema = z.preprocess(normalizeTagSearch, tagSearchShape);

type TagSearch = z.infer<typeof tagSearchShape>;
type TagView = TagSearch["view"];

export const Route = createFileRoute("/_layout/tag/$tag")({
  validateSearch: tagSearchSchema,
  staleTime: 60_000,
  loaderDeps: ({ search }) => ({ view: search.view, sort: search.sort }),
  loader: async ({ context, params, deps }) => {
    const tag = decodeURIComponent(params.tag);
    const page = await tagApi.getTagPage({
      data: {
        tag,
        view: deps.view,
        sort: deps.sort,
        limit: PAGE_SIZE,
        offset: 0,
      },
    });
    tagApi.seedTagPageCaches(context.queryClient, page, {
      tag,
      view: deps.view,
      sort: deps.sort,
      limit: PAGE_SIZE,
      offset: 0,
    });
  },
  head: ({ params }) => {
    const tag = decodeURIComponent(params.tag);
    const baseUrl = getPublicUrlClient();
    const displayTag = tagDisplayTitle(tag);
    const title = `${displayTag} · ${SITE_NAME}`;
    const description = `Articles and publications tagged ${displayTag} across the Atmosphere.`;
    return {
      meta: siteSocialMeta({
        title,
        description,
        url: `${baseUrl.replace(/\/$/, "")}/tag/${encodeURIComponent(tag)}`,
      }),
    };
  },
  component: TagPage,
});

const styles = stylex.create({
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
    paddingBottom: spacing["0"],
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
  tabs: {
    paddingBottom: spacing["10"],
  },
  tabBar: {
    width: "100%",
  },
  tabBarInner: {
    boxSizing: "border-box",
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "1320px",
    paddingLeft: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingRight: {
      default: spacing["5"],
      "@media (min-width: 40rem)": spacing["10"],
    },
    paddingTop: spacing["4"],
    width: "100%",
  },
  tabList: {
    borderBottomStyle: "none",
    borderBottomWidth: 0,
  },
  tabRule: {
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    width: "100%",
  },
  tabPanel: {
    paddingLeft: spacing["0"],
    paddingRight: spacing["0"],
    paddingTop: spacing["6"],
  },
  directoryGrid: {
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  },
  directoryToolbarControls: {
    alignItems: "center",
    columnGap: spacing["2.5"],
    display: "flex",
    flexShrink: 0,
    flexWrap: "wrap",
    justifyContent: {
      default: "space-between",
      "@media (min-width: 40rem)": "flex-start",
    },
    rowGap: spacing["3"],
    maxWidth: "100%",
    minWidth: 0,
    width: {
      default: "100%",
      "@media (min-width: 40rem)": "auto",
    },
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
  empty: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    marginTop: spacing["4"],
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
});

const SORT_OPTIONS = [
  { id: "tagged", label: "Most posts" },
  { id: "readers", label: "Readers" },
  { id: "active", label: "Active" },
  { id: "az", label: "A–Z" },
] as const;

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

function TagArticlesSkeleton({
  rows = ARTICLE_SKELETON_ROWS,
}: {
  rows?: number;
}) {
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

function TagDirectorySkeleton({
  layout,
  count = SKELETON_COUNT,
}: {
  layout: "grid" | "list";
  count?: number;
}) {
  if (layout === "grid") {
    return (
      <Grid
        aria-busy="true"
        aria-label="Loading publications"
        columnGap="lg"
        rowGap="lg"
        style={styles.directoryGrid}
      >
        {Array.from({ length: count }, (_, index) => (
          <PubCardSkeleton key={index} />
        ))}
      </Grid>
    );
  }

  return (
    <div aria-busy="true" aria-label="Loading publications">
      {Array.from({ length: count }, (_, index) => (
        <PubDirectoryRowSkeleton key={index} isLast={index === count - 1} />
      ))}
    </div>
  );
}

function TagArticlesPanel({ tag }: { tag: string }) {
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const { enabled: trackReading } = useTrackReadingHistory();

  const {
    data: feed,
    isPending: feedPending,
    isFetching: feedFetching,
  } = useQuery({
    ...tagApi.getArticlesQueryOptions({
      tag,
      limit: PAGE_SIZE,
      offset: 0,
    }),
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.queryKey[2] === tag) {
        return keepPreviousData(previousData);
      }
      return undefined;
    },
  });

  const [loadedMore, setLoadedMore] = useState<Array<ArticleCard>>([]);
  const [loadedMoreNextOffset, setLoadedMoreNextOffset] = useState<
    number | null
  >(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setLoadedMore([]);
    setLoadedMoreNextOffset(null);
  }, [tag]);

  const items = useMemo(
    () => [...(feed?.items ?? []), ...loadedMore],
    [feed?.items, loadedMore],
  );
  const nextOffset =
    loadedMore.length > 0 ? loadedMoreNextOffset : (feed?.nextOffset ?? null);

  const isLoading = feedPending || (feedFetching && items.length === 0);

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await tagApi.getArticles({
        data: { tag, limit: PAGE_SIZE, offset: nextOffset },
      });
      setLoadedMore((prev) => [...prev, ...page.items]);
      setLoadedMoreNextOffset(page.nextOffset);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [nextOffset, tag]);

  useEffect(() => {
    if (nextOffset == null) return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const root = sentinel.closest("[data-app-scroller]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: "1200px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, nextOffset]);

  if (isLoading) {
    return <TagArticlesSkeleton />;
  }

  if (items.length === 0) {
    return (
      <p {...stylex.props(styles.empty)}>No articles match this tag yet.</p>
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
            unread={trackReading && signedIn && !article.isRead}
            showSaveButton={false}
          />
        ))}
      </div>

      {items.length > 0 ? (
        <>
          <div
            ref={loadMoreSentinelRef}
            aria-hidden
            {...stylex.props(styles.loadSentinel)}
          />
          {loadingMore ? (
            <TagArticlesSkeleton rows={LOAD_MORE_SKELETON_COUNT} />
          ) : nextOffset == null ? (
            <p {...stylex.props(styles.endNote)}>
              You&apos;ve reached the end.
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function TagPublicationsPanel({
  tag,
  sort,
  layout,
}: {
  tag: string;
  sort: "tagged" | "readers" | "active" | "az";
  layout: "grid" | "list";
}) {
  const navigate = useNavigate({ from: Route.fullPath });

  const [loadedMore, setLoadedMore] = useState<Array<TagPublicationCard>>([]);
  const [loadedMoreNextOffset, setLoadedMoreNextOffset] = useState<
    number | null
  >(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const {
    data: directory,
    isPending: directoryPending,
    isFetching: directoryFetching,
  } = useQuery({
    ...tagApi.getPublicationsQueryOptions({
      tag,
      sort,
      limit: PAGE_SIZE,
      offset: 0,
    }),
    placeholderData: (previousData, previousQuery) => {
      if (previousQuery?.queryKey[2] === tag) {
        return keepPreviousData(previousData);
      }
      return undefined;
    },
  });

  useEffect(() => {
    setLoadedMore([]);
    setLoadedMoreNextOffset(null);
  }, [tag, sort]);

  const directoryItems = useMemo(
    () => [...(directory?.items ?? []), ...loadedMore],
    [directory?.items, loadedMore],
  );
  const nextOffset =
    loadedMore.length > 0
      ? loadedMoreNextOffset
      : (directory?.nextOffset ?? null);

  const isDirectoryLoading =
    directoryPending || (directoryFetching && directoryItems.length === 0);

  const updateSearch = (patch: Partial<Pick<TagSearch, "sort" | "layout">>) => {
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev: TagSearch) => ({ ...prev, ...patch }),
    });
  };

  const onSortChange = (keys: Set<React.Key> | "all") => {
    const next =
      keys === "all"
        ? "tagged"
        : (String([...keys][0]) as "tagged" | "readers" | "active" | "az");
    updateSearch({ sort: next });
  };

  const onLayoutChange = (keys: Set<React.Key> | "all") => {
    const next = keys === "all" ? "list" : ([...keys][0] as "grid" | "list");
    updateSearch({ layout: next });
  };

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await tagApi.getPublications({
        data: {
          tag,
          sort,
          limit: PAGE_SIZE,
          offset: nextOffset,
        },
      });
      setLoadedMore((prev) => [...prev, ...page.items]);
      setLoadedMoreNextOffset(page.nextOffset);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [nextOffset, sort, tag]);

  useEffect(() => {
    if (nextOffset == null) return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const root = sentinel.closest("[data-app-scroller]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: "1200px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, nextOffset]);

  return (
    <>
      <SectionHead
        title="All publications"
        action={
          <div {...stylex.props(styles.directoryToolbarControls)}>
            <SegmentedControl
              selectedKeys={new Set([sort])}
              onSelectionChange={onSortChange}
              size="sm"
            >
              {SORT_OPTIONS.map((option) => (
                <SegmentedControlItem key={option.id} id={option.id}>
                  {option.label}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>

            <SegmentedControl
              selectedKeys={new Set([layout])}
              onSelectionChange={onLayoutChange}
              size="sm"
            >
              <SegmentedControlItem id="list" aria-label="List view">
                <List size={16} />
              </SegmentedControlItem>
              <SegmentedControlItem id="grid" aria-label="Grid view">
                <LayoutGrid size={16} />
              </SegmentedControlItem>
            </SegmentedControl>
          </div>
        }
      />

      {isDirectoryLoading ? (
        <TagDirectorySkeleton layout={layout} />
      ) : directoryItems.length === 0 ? (
        <p {...stylex.props(styles.empty)}>
          No publications match this tag yet.
        </p>
      ) : layout === "grid" ? (
        <Grid columnGap="lg" rowGap="lg" style={styles.directoryGrid}>
          {directoryItems.map((pub) => (
            <PubCard
              key={pub.uri}
              pub={pub}
              hideTopic
              tagPostCount={pub.taggedPostCount}
            />
          ))}
        </Grid>
      ) : (
        <div>
          {directoryItems.map((pub, index) => (
            <PubDirectoryRow
              key={pub.uri}
              pub={pub}
              hideTopic
              tagPostCount={pub.taggedPostCount}
              isLast={index === directoryItems.length - 1}
            />
          ))}
        </div>
      )}

      {directoryItems.length > 0 && !isDirectoryLoading ? (
        <>
          <div
            ref={loadMoreSentinelRef}
            aria-hidden
            {...stylex.props(styles.loadSentinel)}
          />
          {loadingMore ? (
            <TagDirectorySkeleton
              layout={layout}
              count={LOAD_MORE_SKELETON_COUNT}
            />
          ) : nextOffset == null ? (
            <p {...stylex.props(styles.endNote)}>
              You&apos;ve reached the end.
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function TagPage() {
  const { tag: rawTag } = Route.useParams();
  const tag = decodeURIComponent(rawTag);
  const { view, sort, layout } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: articleCount = 0 } = useSuspenseQuery(
    tagApi.getArticleCountQueryOptions({ tag }),
  );
  const { data: publicationCount = 0 } = useSuspenseQuery(
    tagApi.getPublicationCountQueryOptions({ tag }),
  );

  const displayTag = tagDisplayTitle(tag);
  const isFeed = view === "feed";

  const activeCount = isFeed ? articleCount : publicationCount;
  const countNoun =
    activeCount === 1
      ? isFeed
        ? "article"
        : "publication"
      : isFeed
        ? "articles"
        : "publications";

  const onViewChange = (key: React.Key) => {
    const next = key as TagView;
    void navigate({ search: (prev: TagSearch) => ({ ...prev, view: next }) });
  };

  return (
    <div>
      <div {...stylex.props(styles.heroInner)}>
        <div {...stylex.props(styles.heroInfo)}>
          <Kicker icon={<Tag size={13} aria-hidden />}>Tag</Kicker>
          <h1 {...stylex.props(styles.heroName)}>{displayTag}</h1>
          <p {...stylex.props(styles.heroDesc)}>
            {isFeed
              ? `Every article tagged ${displayTag} across the Atmosphere.`
              : `Every publication publishing work tagged ${displayTag}. Follow the ones worth your mornings.`}
          </p>
          <div {...stylex.props(styles.stats)}>
            <span>
              <span {...stylex.props(styles.statValue)}>
                {formatCount(activeCount)}
              </span>
              {countNoun}
            </span>
          </div>
        </div>
      </div>

      <Tabs
        selectedKey={view}
        onSelectionChange={onViewChange}
        style={styles.tabs}
      >
        <div {...stylex.props(styles.tabBar)}>
          <div {...stylex.props(styles.tabBarInner)}>
            <TabList aria-label="Tag views" style={styles.tabList}>
              <Tab id="feed">Articles</Tab>
              <Tab id="publications">Publications</Tab>
            </TabList>
          </div>
          <div {...stylex.props(styles.tabRule)} aria-hidden />
        </div>

        <ReaderContent>
          <TabPanel id="feed" style={styles.tabPanel}>
            <TagArticlesPanel tag={tag} />
          </TabPanel>
          <TabPanel id="publications" style={styles.tabPanel}>
            <TagPublicationsPanel tag={tag} sort={sort} layout={layout} />
          </TabPanel>
        </ReaderContent>
      </Tabs>
    </div>
  );
}
