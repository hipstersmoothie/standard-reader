"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  DISCOVER_TOPICS_LIMIT,
  discoverApi,
} from "#/integrations/tanstack-query/api-discover.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import {
  Compass,
  Flame,
  LayoutGrid,
  List,
  Sparkles,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Grid } from "../design-system/grid";
import { SearchField } from "../design-system/search-field";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../design-system/segmented-control";
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
const RAIL_LIMIT = 10;
const SOCIAL_PROOF_COLLAPSED = 3;
const SOCIAL_PROOF_MAX = 60;

const discoverSearchSchema = z.object({
  topic: z.string().optional(),
  sort: z.enum(["readers", "active", "az"]).default("readers"),
  view: z.enum(["grid", "list"]).default("list"),
});

export const Route = createFileRoute("/_layout/discover")({
  validateSearch: discoverSearchSchema,
  loaderDeps: ({ search }) => ({
    topic: search.topic ?? null,
    sort: search.sort,
  }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        discoverApi.getKnownPublicationCountQueryOptions(),
      ),
      context.queryClient.ensureQueryData(
        discoverApi.getTopicsQueryOptions({ limit: DISCOVER_TOPICS_LIMIT }),
      ),
      context.queryClient.ensureQueryData(
        discoverApi.getRecommendedPublicationsQueryOptions({
          limit: RAIL_LIMIT,
        }),
      ),
      context.queryClient.ensureQueryData(
        discoverApi.getFollowedByPeopleYouFollowQueryOptions({
          limit: SOCIAL_PROOF_MAX,
        }),
      ),
      context.queryClient.ensureQueryData(
        discoverApi.getTrendingPublicationsQueryOptions({ limit: RAIL_LIMIT }),
      ),
      context.queryClient.ensureQueryData(
        discoverApi.getPublicationsQueryOptions({
          topic: deps.topic,
          sort: deps.sort,
          limit: DIRECTORY_PAGE_SIZE,
          offset: 0,
        }),
      ),
    ]);
  },
  head: () => ({
    meta: [{ title: "Discover · Standard Reader" }],
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

function Discover() {
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
  const [socialProofExpanded, setSocialProofExpanded] = useState(false);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const { data: topics } = useSuspenseQuery(
    discoverApi.getTopicsQueryOptions({ limit: DISCOVER_TOPICS_LIMIT }),
  );
  const { data: recommended } = useSuspenseQuery(
    discoverApi.getRecommendedPublicationsQueryOptions({ limit: RAIL_LIMIT }),
  );
  const { data: followedBy } = useSuspenseQuery(
    discoverApi.getFollowedByPeopleYouFollowQueryOptions({
      limit: SOCIAL_PROOF_MAX,
    }),
  );
  const { data: trending } = useSuspenseQuery(
    discoverApi.getTrendingPublicationsQueryOptions({ limit: RAIL_LIMIT }),
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

  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  const topicKey = topic ?? "all";
  const topicItems = useMemo(() => sortDiscoverTopics(topics), [topics]);
  const { data: knownPublicationCount = 0 } = useSuspenseQuery(
    discoverApi.getKnownPublicationCountQueryOptions(),
  );

  const isSearching =
    debouncedQ.length > 0 &&
    (searchInput.trim() !== debouncedQ || searchFetching);

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
      { root, rootMargin: "240px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [directoryNextOffset, loadMoreDirectory]);

  const recommendedKicker = signedIn
    ? "Tuned to your follows"
    : "Established reads";
  const recommendedTitle = signedIn ? "Recommended for you" : "Recommended";

  return (
    <ReaderContent>
      <Masthead
        kicker="The directory"
        kickerIcon={<Compass size={13} />}
        title="Discover"
        dek={
          knownPublicationCount > 0
            ? `Every publication the network knows about — ${knownPublicationCount} and counting. Follow the ones worth your mornings.`
            : "Every publication the network knows about — follow the ones worth your mornings."
        }
        metaLabel="Known publications"
        metaValue={
          knownPublicationCount > 0 ? knownPublicationCount : undefined
        }
      />

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

      {signedIn ? (
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
      ) : null}

      <div {...stylex.props(styles.section)}>
        <SectionHead
          kicker="Most active this week"
          title="Trending publications"
          icon={
            <SectionIcon>
              <Flame size={13} />
            </SectionIcon>
          }
        />
        {trending.length > 0 ? (
          <div>
            {trending.slice(0, 5).map((pub, index) => (
              <PubDirectoryRow
                key={pub.uri}
                pub={pub}
                rank={index + 1}
                isLast={index === Math.min(trending.length, 5) - 1}
              />
            ))}
          </div>
        ) : (
          <p {...stylex.props(styles.emptyRail)}>
            No trending publications yet.
          </p>
        )}
      </div>

      <SectionDivider />

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
        ) : directoryItems.length === 0 ? (
          <p {...stylex.props(styles.emptyRail)}>
            {debouncedQ
              ? "No publications match your search."
              : "No publications match this topic yet."}
          </p>
        ) : view === "grid" ? (
          <Grid columnGap="lg" rowGap="lg" style={styles.directoryGrid}>
            {directoryItems.map((pub) => (
              <PubCard key={pub.uri} pub={pub} />
            ))}
          </Grid>
        ) : (
          <div>
            {directoryItems.map((pub, index) => (
              <PubDirectoryRow
                key={pub.uri}
                pub={pub}
                isLast={index === directoryItems.length - 1}
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
    </ReaderContent>
  );
}
