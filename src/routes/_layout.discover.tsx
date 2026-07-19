"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import {
  keepPreviousData,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, List, Users } from "lucide-react";
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
  DISCOVER_TOPICS_LIMIT,
  discoverApi,
} from "#/integrations/tanstack-query/api-discover.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { useFormatters } from "#/lib/use-formatters";

import {
  PubCardSkeleton,
  PubDirectoryRowSkeleton,
} from "../components/reader/cards";
import { DiscoverTopicFilters } from "../components/reader/discover-topic-filters";
import { sortDiscoverTopics } from "../components/reader/discover-topics";
import { initials } from "../components/reader/format";
import {
  Masthead,
  ReaderContent,
  SectionDivider,
  SectionHead,
} from "../components/reader/primitives";
import { PubGridList } from "../components/reader/pub-grid-list";
import { Avatar } from "../design-system/avatar";
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
import { radius } from "../design-system/theme/radius.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "../design-system/theme/typography.stylex";
import type { PublicationCard } from "../integrations/tanstack-query/api-shapes";

const DIRECTORY_PAGE_SIZE = 24;
const DIRECTORY_SEARCH_DEBOUNCE_MS = 300;
const DIRECTORY_SKELETON_COUNT = 8;
const DIRECTORY_LOAD_MORE_SKELETON_COUNT = 3;
const DEFERRED_ROOT_MARGIN = "600px 0px";
const RAIL_LIMIT = 10;
const TRENDING_LIMIT_OPTIONS = [5, 10, 20, 50, 100] as const;
const DEFAULT_TRENDING_LIMIT = 5;
const SOCIAL_PROOF_MAX = 60;
/**
 * How long the loader will wait for the "people you follow" lookup before
 * giving up and letting it stream in.
 *
 * The wait doubles as the warmth test: the reader's Bluesky graph is cached
 * server-side for ten minutes, and a warm lookup comes back in ~400ms while a
 * cold sweep of the whole author set can't. So a warm hit lands inside the
 * budget and the prompt is in the first paint; a cold one loses the race and
 * costs the page nothing.
 */
const FRIENDS_PROMPT_BUDGET_MS = 700;

const discoverSearchSchema = z.object({
  topic: z.string().optional(),
  sort: z.enum(["readers", "active", "az"]).default("readers"),
  view: z.enum(["grid", "list"]).default("list"),
});

export const Route = createFileRoute("/_layout/discover")({
  validateSearch: discoverSearchSchema,
  loaderDeps: ({ search }) => ({ topic: search.topic, sort: search.sort }),
  loader: async ({ context, deps, preload }) => {
    const knownCountOptions =
      discoverApi.getKnownPublicationCountQueryOptions();
    const extrasOptions = discoverApi.getDiscoverExtrasQueryOptions({
      recommendedLimit: RAIL_LIMIT,
      socialProofLimit: SOCIAL_PROOF_MAX,
    });
    const trendingOptions = discoverApi.getTrendingPublicationsQueryOptions({
      limit: DEFAULT_TRENDING_LIMIT,
    });
    const topicsOptions = discoverApi.getTopicsQueryOptions({
      limit: DISCOVER_TOPICS_LIMIT,
    });
    const directoryOptions = discoverApi.getPublicationsQueryOptions({
      topic: deps.topic ?? null,
      sort: deps.sort,
      limit: DIRECTORY_PAGE_SIZE,
      offset: 0,
    });
    // Shared with /friends, so following the prompt is a cache hit.
    const friendsOptions = discoverApi.getFriendPublishersQueryOptions({
      limit: FRIENDS_PROMPT_PAGE,
    });

    if (preload) {
      void context.queryClient.prefetchQuery(knownCountOptions);
      void context.queryClient.prefetchQuery(extrasOptions);
      void context.queryClient.prefetchQuery(trendingOptions);
      void context.queryClient.prefetchQuery(topicsOptions);
      void context.queryClient.prefetchQuery(directoryOptions);
      void context.queryClient.prefetchQuery(friendsOptions);
      return;
    }

    // Await only the masthead count + trending (first content rail). Both are
    // fast (~115ms) so the page paints immediately without a header skeleton.
    // The recommended + social-proof rails (getDiscoverExtras, ~750ms) are
    // prefetched here and stream in via a non-blocking useQuery in the
    // component, so they never gate first paint.
    await Promise.all([
      context.queryClient.ensureQueryData(knownCountOptions),
      context.queryClient.ensureQueryData(trendingOptions),
    ]);
    void context.queryClient.prefetchQuery(extrasOptions);
    void context.queryClient.prefetchQuery(topicsOptions);
    void context.queryClient.prefetchQuery(directoryOptions);

    // Block on the friends lookup only if it can be answered from the warm
    // server-side cache. `prefetchQuery` never rejects, so the race is safe;
    // whichever side wins, the query is in flight and the prompt renders as
    // soon as it resolves.
    await Promise.race([
      context.queryClient.prefetchQuery(friendsOptions),
      new Promise((resolve) => setTimeout(resolve, FRIENDS_PROMPT_BUDGET_MS)),
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
  friendsPrompt: {
    alignItems: {
      default: "stretch",
      "@media (min-width: 40rem)": "center",
    },
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    columnGap: spacing["5"],
    display: "flex",
    flexDirection: {
      default: "column",
      "@media (min-width: 40rem)": "row",
    },
    justifyContent: "space-between",
    marginBottom: spacing["12"],
    paddingBottom: spacing["4"],
    paddingInlineEnd: spacing["5"],
    paddingInlineStart: spacing["5"],
    paddingTop: spacing["4"],
    rowGap: spacing["4"],
  },
  friendsPromptMain: {
    alignItems: "center",
    columnGap: spacing["4"],
    display: "flex",
    minWidth: 0,
  },
  friendsAvatars: {
    display: "flex",
    flexShrink: 0,
    // Overlap the stack, first avatar on top, so it reads as a group of people
    // rather than a row of unrelated icons.
    paddingInlineStart: spacing["2"],
  },
  friendsAvatar: {
    borderColor: uiColor.bg,
    borderStyle: "solid",
    borderWidth: 2,
    marginInlineStart: `calc(-1 * ${spacing["2"]})`,
  },
  friendsPromptText: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.base,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
    minWidth: 0,
  },
  friendsPromptDek: {
    color: uiColor.text1,
    display: "block",
    fontSize: fontSize.sm,
  },
  friendsPromptAction: {
    flexShrink: 0,
  },
  railWrap: {
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
});

const SORT_OPTIONS: ReadonlyArray<{ id: string; label: MessageDescriptor }> = [
  { id: "readers", label: msg`Readers` },
  { id: "active", label: msg`Active` },
  { id: "az", label: msg`A–Z` },
];

function HorizontalRail({
  pubs,
  "aria-label": ariaLabel,
}: {
  pubs: Array<PublicationCard>;
  "aria-label": string;
}) {
  return (
    <div {...stylex.props(styles.railWrap)}>
      <PubGridList
        pubs={pubs}
        layout="rail"
        variant="card"
        aria-label={ariaLabel}
      />
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
  const { t } = useLingui();

  if (view === "grid") {
    return (
      <Grid
        aria-label={t`Loading publications`}
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
    <div aria-label={t`Loading publications`}>
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

    // The page scrolls at the document level, so measure against the viewport.
    const marginY = Number.parseInt(DEFERRED_ROOT_MARGIN, 10) || 600;
    const isNearView = () => {
      const nodeRect = node.getBoundingClientRect();
      return (
        nodeRect.bottom >= -marginY &&
        nodeRect.top <= globalThis.innerHeight + marginY
      );
    };

    if (isNearView()) {
      queueMicrotask(() => setMounted(true));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: DEFERRED_ROOT_MARGIN, threshold: 0 },
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

function DiscoverDirectorySectionSkeleton({ view }: { view: "grid" | "list" }) {
  const { t } = useLingui();

  return (
    <div
      {...stylex.props(styles.section)}
      aria-label={t`Loading publication directory`}
    >
      <SectionHead
        kicker={<Trans>Browse everything</Trans>}
        title={<Trans>All publications</Trans>}
      />
      <DiscoverDirectoryToolbarSkeleton />
      <DiscoverDirectorySkeleton view={view} />
    </div>
  );
}

const FRIENDS_PROMPT_AVATARS = 4;
/** The prompt only needs the headline counts and a few faces. */
const FRIENDS_PROMPT_PAGE = 4;

/**
 * Entry point to `/friends` — publications written by the people the reader
 * follows on Bluesky. Renders only once we know there's someone to show, so it
 * never occupies the top of Discover with an empty promise (the surrounding
 * rails behave the same way).
 */
function DiscoverFriendsPrompt() {
  const { t } = useLingui();
  const { data } = useQuery(
    discoverApi.getFriendPublishersQueryOptions({
      limit: FRIENDS_PROMPT_PAGE,
    }),
  );
  const totalPeople = data?.totalPeople ?? 0;

  if (totalPeople === 0) return null;

  const shown = data?.previewAuthors.slice(0, FRIENDS_PROMPT_AVATARS) ?? [];

  return (
    <div {...stylex.props(styles.friendsPrompt)}>
      <div {...stylex.props(styles.friendsPromptMain)}>
        <div {...stylex.props(styles.friendsAvatars)} aria-hidden>
          {shown.map((author) => (
            <Avatar
              key={author.did}
              src={author.avatarUrl ?? undefined}
              alt=""
              size="md"
              fallback={initials(author.handle ?? author.did)}
              style={styles.friendsAvatar}
            />
          ))}
        </div>
        <p {...stylex.props(styles.friendsPromptText)}>
          <Plural
            value={totalPeople}
            one="# person you follow writes here"
            other="# people you follow write here"
          />
          <span {...stylex.props(styles.friendsPromptDek)}>
            <Plural
              value={data?.publicationCount ?? 0}
              one="# publication from your Bluesky follows"
              other="# publications from your Bluesky follows"
            />
          </span>
        </p>
      </div>
      <ButtonLink
        to="/friends"
        variant="secondary"
        size="md"
        style={styles.friendsPromptAction}
        aria-label={t`See publications from the people you follow`}
      >
        <Users size={16} aria-hidden />
        <Trans>Find your friends</Trans>
      </ButtonLink>
    </div>
  );
}

function DiscoverRecommendedSection({
  signedIn,
  recommended,
}: {
  signedIn: boolean;
  recommended: Array<PublicationCard> | undefined;
}) {
  const { t } = useLingui();
  const recommendedTitle = signedIn ? t`Recommended for you` : t`Recommended`;

  if (recommended === undefined) return null;

  return (
    <div {...stylex.props(styles.section)}>
      <SectionHead title={recommendedTitle} />
      {recommended.length > 0 ? (
        <HorizontalRail pubs={recommended} aria-label={recommendedTitle} />
      ) : (
        <p {...stylex.props(styles.emptyRail)}>
          <Trans>
            Subscribe to a few publications to unlock recommendations.
          </Trans>
        </p>
      )}
    </div>
  );
}

function DiscoverSocialProofSection({
  followedBy,
}: {
  followedBy: Array<PublicationCard> | undefined;
}) {
  const { t } = useLingui();
  const socialProofTitle = t`Subscribed to by people you follow`;

  if (followedBy === undefined) return null;

  return (
    <div {...stylex.props(styles.section)}>
      <SectionHead title={socialProofTitle} />
      {followedBy.length > 0 ? (
        <HorizontalRail pubs={followedBy} aria-label={socialProofTitle} />
      ) : (
        <p {...stylex.props(styles.emptyRail)}>
          <Trans>
            Subscribe to more publications to see what similar readers enjoy.
          </Trans>
        </p>
      )}
    </div>
  );
}

function DiscoverTrendingSection() {
  const { t } = useLingui();
  const trendingTitle = t`Trending publications`;
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
        title={trendingTitle}
        // The limit chooser is a compact control, not a full-width mobile
        // action — stacking it under the heading wasted a row and read as a
        // second, unrelated element. Keep it on the heading line at every width.
        stackOnMobile={false}
        action={
          <Select
            aria-label={t`Publications shown`}
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
        <PubGridList
          pubs={trending}
          layout="list"
          variant="row"
          showRank
          aria-label={trendingTitle}
        />
      ) : (
        <p {...stylex.props(styles.emptyRail)}>
          <Trans>No trending publications yet.</Trans>
        </p>
      )}
    </div>
  );
}

function DiscoverDirectorySection({ signedIn }: { signedIn: boolean }) {
  const { t, i18n } = useLingui();
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

    // Viewport observer — the page scrolls at the document level.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreDirectory();
        }
      },
      { root: null, rootMargin: "1200px 0px", threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [directoryNextOffset, loadMoreDirectory]);

  return (
    <div {...stylex.props(styles.section)}>
      <SectionHead
        kicker={<Trans>Browse everything</Trans>}
        title={<Trans>All publications</Trans>}
        action={
          <SearchField
            aria-label={t`Search publications`}
            placeholder={t`Search by name, handle, or topic…`}
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
              <SegmentedControlItem id="all">
                <Trans>All</Trans>
              </SegmentedControlItem>
              <SegmentedControlItem id="not-following">
                <Trans>Not subscribed</Trans>
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
                {i18n._(option.label)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>

          <SegmentedControl
            selectedKeys={new Set([view])}
            onSelectionChange={onViewChange}
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
      </div>

      {isSearching ? (
        <DiscoverDirectorySkeleton view={view} />
      ) : visibleDirectoryItems.length === 0 ? (
        <p {...stylex.props(styles.emptyRail)}>
          {hideFollowing && directoryItems.length > 0
            ? t`You're subscribed to every publication on this page — scroll for more, or turn off the filter.`
            : debouncedQ
              ? t`No publications match your search.`
              : t`No publications match this topic yet.`}
        </p>
      ) : view === "grid" ? (
        <PubGridList
          pubs={visibleDirectoryItems}
          layout="grid"
          variant="card"
          aria-label={t`Publications`}
        />
      ) : (
        <PubGridList
          pubs={visibleDirectoryItems}
          layout="list"
          variant="row"
          aria-label={t`Publications`}
        />
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
              <Trans>You&apos;ve reached the end.</Trans>
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

function DiscoverMastheadDek({
  knownPublicationCount,
}: {
  knownPublicationCount: number;
}) {
  const fmt = useFormatters();
  if (knownPublicationCount <= 0) {
    return (
      <Trans>
        Every publication the network knows about — subscribe to the ones worth
        your mornings.
      </Trans>
    );
  }

  const publicationCount = fmt.compactNumber(knownPublicationCount);

  return (
    <Trans>
      Every publication the network knows about — {publicationCount} and
      counting. Subscribe to the ones worth your mornings.
    </Trans>
  );
}

function Discover() {
  const { t } = useLingui();
  const fmt = useFormatters();
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);

  // Masthead count — loader-seeded, fast (~115ms), gates first paint.
  const { data: knownPublicationCount = 0 } = useSuspenseQuery(
    discoverApi.getKnownPublicationCountQueryOptions(),
  );

  // Recommended + social-proof rails — prefetched by the loader but never
  // gates first paint. Streams in with rail skeletons while resolving.
  const { data: extras } = useQuery({
    ...discoverApi.getDiscoverExtrasQueryOptions({
      recommendedLimit: RAIL_LIMIT,
      socialProofLimit: SOCIAL_PROOF_MAX,
    }),
  });

  return (
    <ReaderContent>
      <Masthead
        kicker={<Trans>The directory</Trans>}
        title={<Trans>Discover</Trans>}
        dek={
          <DiscoverMastheadDek knownPublicationCount={knownPublicationCount} />
        }
        metaLabel={t`Known publications`}
        metaValue={
          knownPublicationCount > 0
            ? fmt.compactNumber(knownPublicationCount)
            : undefined
        }
      />

      {signedIn ? <DiscoverFriendsPrompt /> : null}

      <DiscoverTrendingSection />

      <DiscoverRecommendedSection
        signedIn={signedIn}
        recommended={extras?.recommended}
      />

      {signedIn ? (
        <DiscoverSocialProofSection followedBy={extras?.followedBy ?? []} />
      ) : null}

      <SectionDivider />

      <DiscoverDirectoryDeferred signedIn={signedIn} />
    </ReaderContent>
  );
}
