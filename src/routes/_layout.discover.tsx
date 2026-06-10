"use client";

import * as stylex from "@stylexjs/stylex";
import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  DISCOVER_TOPICS_LIMIT,
  discoverApi,
} from "#/integrations/tanstack-query/api-discover.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { formatCount } from "#/lib/format-count";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import {
  Compass,
  Flame,
  LayoutGrid,
  List,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";

import type { PublicationCard } from "../integrations/tanstack-query/api-shapes";

import {
  PubCard,
  PubCardSkeleton,
  PubDirectoryRow,
  PubDirectoryRowSkeleton,
} from "../components/reader/cards";
import { DiscoverTopicFilters } from "../components/reader/discover-topic-filters";
import { sortDiscoverTopics } from "../components/reader/discover-topics";
import {
  Masthead,
  ReaderContent,
  SectionDivider,
  SectionHead,
} from "../components/reader/primitives";
import { Button } from "../design-system/button";
import { Flex } from "../design-system/flex";
import { Grid } from "../design-system/grid";
import { SearchField } from "../design-system/search-field";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../design-system/segmented-control";
import { Select, SelectItem } from "../design-system/select";
import { Skeleton } from "../design-system/skeleton";
import { uiColor } from "../design-system/theme/color.stylex";
import { gap } from "../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "../design-system/theme/typography.stylex";

const DIRECTORY_PAGE_SIZE = 24;
const DIRECTORY_SEARCH_DEBOUNCE_MS = 300;
const DIRECTORY_SKELETON_COUNT = 8;
const DIRECTORY_LOAD_MORE_SKELETON_COUNT = 3;
const DEFERRED_ROOT_MARGIN = "600px 0px";
const RAIL_LIMIT = 10;
const RAIL_SKELETON_COUNT = 4;
const TRENDING_LIMIT_OPTIONS = [5, 10, 20, 50, 100] as const;
const DEFAULT_TRENDING_LIMIT = 5;
const SOCIAL_PROOF_COLLAPSED = 3;
const SOCIAL_PROOF_MAX = 60;

const discoverSearchSchema = z.object({
  topic: z.string().optional(),
  sort: z.enum(["readers", "active", "az"]).default("readers"),
  view: z.enum(["grid", "list"]).default("list"),
});

export const Route = createFileRoute("/_layout/discover")({
  validateSearch: discoverSearchSchema,
  loader: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );

    await Promise.all([
      context.queryClient.ensureQueryData(
        discoverApi.getKnownPublicationCountQueryOptions(),
      ),
      context.queryClient.ensureQueryData(
        discoverApi.getRecommendedPublicationsQueryOptions({
          limit: RAIL_LIMIT,
        }),
      ),
      ...(session?.user
        ? [
            context.queryClient.ensureQueryData(
              discoverApi.getFollowedByPeopleYouFollowQueryOptions({
                limit: SOCIAL_PROOF_MAX,
              }),
            ),
          ]
        : []),
    ]);
  },
  head: () => ({
    meta: pageSocialMeta("discover", getPublicUrlClient()),
  }),
  component: Discover,
});

const styles = stylex.create({
  section: {
    marginBottom: spacing["12"],
  },
  railWrap: {
    marginTop: spacing["5"],
  },
  railScroll: {
    scrollSnapType: "x mandatory",
    alignItems: "stretch",
    columnGap: gap["lg"],
    display: "grid",
    gridAutoColumns: {
      default: "260px",
      "@media (min-width: 40rem)": "300px",
    },
    gridAutoFlow: "column",
    rowGap: gap["lg"],
    // eslint-disable-next-line @stylexjs/valid-styles
    scrollbarWidth: "thin",
    marginTop: `calc(${spacing["3"]} * -1)`,
    overflowX: "auto",
    paddingBottom: spacing["2"],
    paddingTop: spacing["3"],
  },
  socialGrid: {
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    marginTop: spacing["5"],
  },
  directorySearch: {
    flexShrink: 0,
    minWidth: 0,
    width: {
      default: "100%",
      "@media (min-width: 40rem)": spacing["64"],
    },
  },
  directoryToolbar: {
    alignItems: {
      default: "stretch",
      "@media (min-width: 40rem)": "center",
    },
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 40rem)": "row",
    },
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing["4"],
    marginBottom: spacing["6"],
    minWidth: 0,
    width: "100%",
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
  directoryGrid: {
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
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
  emptyRail: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontStyle: "italic",
    lineHeight: lineHeight.sm,
    marginTop: spacing["4"],
  },
  trendingLimitSelect: {
    flexShrink: 0,
    width: spacing["20"],
  },
  toolbarSkeleton: {
    marginBottom: spacing["6"],
  },
  toolbarSkeletonFilters: {
    flexWrap: "wrap",
  },
  kickerIcon: {
    height: spacing["3.5"],
    width: spacing["3.5"],
  },
});

const SORT_OPTIONS = [
  { id: "readers", label: "Readers" },
  { id: "active", label: "Active" },
  { id: "az", label: "A–Z" },
] as const;

function SectionIcon({ children }: { children: React.ReactNode }) {
  return <span {...stylex.props(styles.kickerIcon)}>{children}</span>;
}

function HorizontalRail({ pubs }: { pubs: Array<PublicationCard> }) {
  return (
    <div {...stylex.props(styles.railWrap)}>
      <div {...stylex.props(styles.railScroll)}>
        {pubs.map((pub) => (
          <PubCard key={pub.uri} pub={pub} rail />
        ))}
      </div>
    </div>
  );
}

function DiscoverDirectorySkeleton({
  view,
  count = DIRECTORY_SKELETON_COUNT,
}: {
  view: "grid" | "list";
  count?: number;
}) {
  if (view === "grid") {
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

function DeferredMount({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return;

    const node = rootRef.current;
    if (!node) return;

    const root = node.closest("[data-app-scroller]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { root, rootMargin: DEFERRED_ROOT_MARGIN, threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [mounted]);

  return <div ref={rootRef}>{mounted ? children : fallback}</div>;
}

function DiscoverDirectoryToolbarSkeleton() {
  return (
    <div
      aria-hidden
      {...stylex.props(styles.directoryToolbar, styles.toolbarSkeleton)}
    >
      <Flex gap="sm" wrap style={styles.toolbarSkeletonFilters}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton
            key={index}
            variant="rectangle"
            height={spacing["8"]}
            width={spacing["16"]}
          />
        ))}
      </Flex>
      <Flex gap="sm" wrap>
        <Skeleton
          variant="rectangle"
          height={spacing["8"]}
          width={spacing["24"]}
        />
        <Skeleton
          variant="rectangle"
          height={spacing["8"]}
          width={spacing["28"]}
        />
      </Flex>
    </div>
  );
}

function DiscoverRecommendedSkeleton({ signedIn }: { signedIn: boolean }) {
  return (
    <div
      {...stylex.props(styles.section)}
      aria-busy="true"
      aria-label="Loading recommendations"
    >
      <SectionHead
        kicker={signedIn ? "Tuned to your follows" : "Established reads"}
        title={signedIn ? "Recommended for you" : "Recommended"}
        icon={
          <SectionIcon>
            <Sparkles size={13} />
          </SectionIcon>
        }
      />
      <div {...stylex.props(styles.railWrap)}>
        <div {...stylex.props(styles.railScroll)}>
          {Array.from({ length: RAIL_SKELETON_COUNT }, (_, index) => (
            <PubCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DiscoverSocialProofSkeleton() {
  return (
    <div
      {...stylex.props(styles.section)}
      aria-busy="true"
      aria-label="Loading social proof"
    >
      <SectionHead
        kicker="Social proof"
        title="Followed by people you follow"
        icon={
          <SectionIcon>
            <Users size={13} />
          </SectionIcon>
        }
      />
      <Grid columnGap="lg" rowGap="lg" style={styles.socialGrid}>
        {Array.from({ length: SOCIAL_PROOF_COLLAPSED }, (_, index) => (
          <PubCardSkeleton key={index} />
        ))}
      </Grid>
    </div>
  );
}

function DiscoverTrendingSkeleton() {
  return (
    <div
      {...stylex.props(styles.section)}
      aria-busy="true"
      aria-label="Loading trending publications"
    >
      <SectionHead
        kicker="Most active this week"
        title="Trending publications"
        icon={
          <SectionIcon>
            <Flame size={13} />
          </SectionIcon>
        }
      />
      {Array.from({ length: DEFAULT_TRENDING_LIMIT }, (_, index) => (
        <PubDirectoryRowSkeleton
          key={index}
          isLast={index === DEFAULT_TRENDING_LIMIT - 1}
        />
      ))}
    </div>
  );
}

function DiscoverDirectorySectionSkeleton({ view }: { view: "grid" | "list" }) {
  return (
    <div
      {...stylex.props(styles.section)}
      aria-busy="true"
      aria-label="Loading publication directory"
    >
      <SectionHead kicker="Browse everything" title="All publications" />
      <DiscoverDirectoryToolbarSkeleton />
      <DiscoverDirectorySkeleton view={view} />
    </div>
  );
}

function DiscoverRecommendedSection({ signedIn }: { signedIn: boolean }) {
  const { data: recommended } = useSuspenseQuery(
    discoverApi.getRecommendedPublicationsQueryOptions({ limit: RAIL_LIMIT }),
  );

  const recommendedKicker = signedIn
    ? "Tuned to your follows"
    : "Established reads";
  const recommendedTitle = signedIn ? "Recommended for you" : "Recommended";

  return (
    <div {...stylex.props(styles.section)}>
      <SectionHead
        kicker={recommendedKicker}
        title={recommendedTitle}
        icon={
          <SectionIcon>
            <Sparkles size={13} />
          </SectionIcon>
        }
      />
      {recommended.length > 0 ? (
        <HorizontalRail pubs={recommended} />
      ) : (
        <p {...stylex.props(styles.emptyRail)}>
          Follow a few publications to unlock recommendations.
        </p>
      )}
    </div>
  );
}

function DiscoverSocialProofSection() {
  const { data: followedBy } = useSuspenseQuery(
    discoverApi.getFollowedByPeopleYouFollowQueryOptions({
      limit: SOCIAL_PROOF_MAX,
    }),
  );
  const [socialProofExpanded, setSocialProofExpanded] = useState(false);

  return (
    <div {...stylex.props(styles.section)}>
      <SectionHead
        kicker="Social proof"
        title="Followed by people you follow"
        icon={
          <SectionIcon>
            <Users size={13} />
          </SectionIcon>
        }
        action={
          followedBy.length > SOCIAL_PROOF_COLLAPSED ? (
            <Button
              variant="tertiary"
              size="sm"
              onPress={() => setSocialProofExpanded((open) => !open)}
            >
              {socialProofExpanded ? "Show less" : "Show more"}
            </Button>
          ) : undefined
        }
      />
      {followedBy.length > 0 ? (
        <Grid columnGap="lg" rowGap="lg" style={styles.socialGrid}>
          {(socialProofExpanded
            ? followedBy
            : followedBy.slice(0, SOCIAL_PROOF_COLLAPSED)
          ).map((pub) => (
            <PubCard key={pub.uri} pub={pub} />
          ))}
        </Grid>
      ) : (
        <p {...stylex.props(styles.emptyRail)}>
          Follow more publications to see what similar readers subscribe to.
        </p>
      )}
    </div>
  );
}

function DiscoverTrendingSection() {
  const [trendingLimit, setTrendingLimit] = useState(DEFAULT_TRENDING_LIMIT);
  const { data: trending = [], isPending } = useQuery({
    ...discoverApi.getTrendingPublicationsQueryOptions({
      limit: trendingLimit,
    }),
    placeholderData: keepPreviousData,
  });

  return (
    <div {...stylex.props(styles.section)}>
      <SectionHead
        kicker="Most active this week"
        title="Trending publications"
        icon={
          <SectionIcon>
            <Flame size={13} />
          </SectionIcon>
        }
        action={
          <Select
            aria-label="Publications shown"
            items={TRENDING_LIMIT_OPTIONS.map((limit) => ({
              id: limit,
              label: String(limit),
            }))}
            size="sm"
            style={styles.trendingLimitSelect}
            value={trendingLimit}
            variant="tertiary"
            onChange={(key) => {
              const next = Number(key);
              if (
                TRENDING_LIMIT_OPTIONS.includes(
                  next as (typeof TRENDING_LIMIT_OPTIONS)[number],
                )
              ) {
                setTrendingLimit(next);
              }
            }}
          >
            {(item) => <SelectItem id={item.id}>{item.label}</SelectItem>}
          </Select>
        }
      />
      {isPending && trending.length === 0 ? (
        Array.from({ length: trendingLimit }, (_, index) => (
          <PubDirectoryRowSkeleton
            key={index}
            isLast={index === trendingLimit - 1}
          />
        ))
      ) : trending.length > 0 ? (
        <div>
          {trending.map((pub, index) => (
            <PubDirectoryRow
              key={pub.uri}
              pub={pub}
              rank={index + 1}
              isLast={index === trending.length - 1}
            />
          ))}
        </div>
      ) : (
        <p {...stylex.props(styles.emptyRail)}>No trending publications yet.</p>
      )}
    </div>
  );
}

function DiscoverDirectorySection({ signedIn }: { signedIn: boolean }) {
  const { topic, sort, view } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [directoryItems, setDirectoryItems] = useState<Array<PublicationCard>>(
    [],
  );
  const [directoryNextOffset, setDirectoryNextOffset] = useState<number | null>(
    null,
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [hideFollowing, setHideFollowing] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const { data: topics } = useSuspenseQuery(
    discoverApi.getTopicsQueryOptions({ limit: DISCOVER_TOPICS_LIMIT }),
  );
  const { data: directory } = useSuspenseQuery(
    discoverApi.getPublicationsQueryOptions({
      topic: topic ?? null,
      sort,
      limit: DIRECTORY_PAGE_SIZE,
      offset: 0,
    }),
  );
  const { data: searchDirectory, isFetching: searchFetching } = useQuery({
    ...discoverApi.getPublicationsQueryOptions({
      topic: topic ?? null,
      sort,
      limit: DIRECTORY_PAGE_SIZE,
      offset: 0,
      q: debouncedQ || undefined,
    }),
    enabled: debouncedQ.length > 0,
  });
  const { data: effectiveFollowUris = [] } = useQuery({
    ...discoverApi.getEffectiveFollowUrisQueryOptions(),
    enabled: signedIn,
  });

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setDebouncedQ(searchInput.trim());
    }, DIRECTORY_SEARCH_DEBOUNCE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (debouncedQ) {
      if (searchDirectory) {
        setDirectoryItems(searchDirectory.items);
        setDirectoryNextOffset(searchDirectory.nextOffset);
      } else {
        setDirectoryItems([]);
        setDirectoryNextOffset(null);
      }
      return;
    }
    setDirectoryItems(directory.items);
    setDirectoryNextOffset(directory.nextOffset);
  }, [directory, searchDirectory, debouncedQ]);

  const topicKey = topic ?? "all";
  const topicItems = useMemo(() => sortDiscoverTopics(topics), [topics]);

  const isSearching =
    debouncedQ.length > 0 &&
    (searchInput.trim() !== debouncedQ || searchFetching);

  const followUriSet = useMemo(
    () => new Set(effectiveFollowUris),
    [effectiveFollowUris],
  );
  const visibleDirectoryItems = useMemo(
    () =>
      hideFollowing
        ? directoryItems.filter((pub) => !followUriSet.has(pub.uri))
        : directoryItems,
    [directoryItems, followUriSet, hideFollowing],
  );

  const updateDirectorySearch = (
    patch: Partial<z.infer<typeof discoverSearchSchema>>,
  ) => {
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, ...patch }),
    });
  };

  const onTopicChange = (keys: Set<React.Key> | "all") => {
    if (keys === "all" || (keys instanceof Set && keys.size === 0)) {
      updateDirectorySearch({ topic: undefined });
      return;
    }
    const id = String([...keys][0]);
    updateDirectorySearch({ topic: id === "all" ? undefined : id });
  };

  const onSortChange = (keys: Set<React.Key> | "all") => {
    const next =
      keys === "all"
        ? "readers"
        : (String([...keys][0]) as "readers" | "active" | "az");
    updateDirectorySearch({ sort: next });
  };

  const onViewChange = (keys: Set<React.Key> | "all") => {
    const next = keys === "all" ? "list" : ([...keys][0] as "grid" | "list");
    updateDirectorySearch({ view: next });
  };

  const onFollowFilterChange = (keys: Set<React.Key> | "all") => {
    const id = keys === "all" ? "all" : String([...keys][0]);
    setHideFollowing(id === "not-following");
  };

  const loadMoreDirectory = useCallback(async () => {
    if (directoryNextOffset == null || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await discoverApi.getPublications({
        data: {
          topic: topic ?? null,
          sort,
          limit: DIRECTORY_PAGE_SIZE,
          offset: directoryNextOffset,
          q: debouncedQ || undefined,
        },
      });
      setDirectoryItems((prev) => [...prev, ...page.items]);
      setDirectoryNextOffset(page.nextOffset);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [debouncedQ, directoryNextOffset, sort, topic]);

  useEffect(() => {
    if (directoryNextOffset == null) return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const root = sentinel.closest("[data-app-scroller]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreDirectory();
        }
      },
      { root, rootMargin: "1200px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [directoryNextOffset, loadMoreDirectory]);

  return (
    <div {...stylex.props(styles.section)}>
      <SectionHead
        kicker="Browse everything"
        title="All publications"
        action={
          <SearchField
            aria-label="Search publications"
            placeholder="Search by name, handle, or topic…"
            value={searchInput}
            onChange={setSearchInput}
            style={styles.directorySearch}
          />
        }
      />

      <div {...stylex.props(styles.directoryToolbar)}>
        <DiscoverTopicFilters
          topicKey={topicKey}
          topicItems={topicItems}
          onTopicChange={onTopicChange}
        />

        <div {...stylex.props(styles.directoryToolbarControls)}>
          {signedIn ? (
            <SegmentedControl
              selectedKeys={new Set([hideFollowing ? "not-following" : "all"])}
              onSelectionChange={onFollowFilterChange}
              size="sm"
            >
              <SegmentedControlItem id="all">All</SegmentedControlItem>
              <SegmentedControlItem id="not-following">
                Not following
              </SegmentedControlItem>
            </SegmentedControl>
          ) : null}

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
            selectedKeys={new Set([view])}
            onSelectionChange={onViewChange}
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
      </div>

      {isSearching ? (
        <DiscoverDirectorySkeleton view={view} />
      ) : visibleDirectoryItems.length === 0 ? (
        <p {...stylex.props(styles.emptyRail)}>
          {hideFollowing && directoryItems.length > 0
            ? "You're following every publication on this page — scroll for more, or turn off the filter."
            : debouncedQ
              ? "No publications match your search."
              : "No publications match this topic yet."}
        </p>
      ) : view === "grid" ? (
        <Grid columnGap="lg" rowGap="lg" style={styles.directoryGrid}>
          {visibleDirectoryItems.map((pub) => (
            <PubCard key={pub.uri} pub={pub} />
          ))}
        </Grid>
      ) : (
        <div>
          {visibleDirectoryItems.map((pub, index) => (
            <PubDirectoryRow
              key={pub.uri}
              pub={pub}
              isLast={index === visibleDirectoryItems.length - 1}
            />
          ))}
        </div>
      )}

      {directoryItems.length > 0 && !isSearching ? (
        <>
          <div
            ref={loadMoreSentinelRef}
            aria-hidden
            {...stylex.props(styles.loadSentinel)}
          />
          {loadingMore ? (
            <DiscoverDirectorySkeleton
              view={view}
              count={DIRECTORY_LOAD_MORE_SKELETON_COUNT}
            />
          ) : directoryNextOffset == null ? (
            <p {...stylex.props(styles.endNote)}>
              You&apos;ve reached the end.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function DiscoverDirectoryDeferred({ signedIn }: { signedIn: boolean }) {
  const { view } = Route.useSearch();
  const skeleton = <DiscoverDirectorySectionSkeleton view={view} />;

  return (
    <DeferredMount fallback={skeleton}>
      <Suspense fallback={skeleton}>
        <DiscoverDirectorySection signedIn={signedIn} />
      </Suspense>
    </DeferredMount>
  );
}

function Discover() {
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const { data: knownPublicationCount = 0 } = useSuspenseQuery(
    discoverApi.getKnownPublicationCountQueryOptions(),
  );

  return (
    <ReaderContent>
      <Masthead
        kicker="The directory"
        kickerIcon={<Compass size={13} />}
        title="Discover"
        dek={
          knownPublicationCount > 0
            ? `Every publication the network knows about — ${formatCount(knownPublicationCount)} and counting. Follow the ones worth your mornings.`
            : "Every publication the network knows about — follow the ones worth your mornings."
        }
        metaLabel="Known publications"
        metaValue={
          knownPublicationCount > 0
            ? formatCount(knownPublicationCount)
            : undefined
        }
      />

      <Suspense fallback={<DiscoverRecommendedSkeleton signedIn={signedIn} />}>
        <DiscoverRecommendedSection signedIn={signedIn} />
      </Suspense>

      {signedIn ? (
        <Suspense fallback={<DiscoverSocialProofSkeleton />}>
          <DiscoverSocialProofSection />
        </Suspense>
      ) : null}

      <DeferredMount fallback={<DiscoverTrendingSkeleton />}>
        <DiscoverTrendingSection />
      </DeferredMount>

      <SectionDivider />

      <DiscoverDirectoryDeferred signedIn={signedIn} />
    </ReaderContent>
  );
}
