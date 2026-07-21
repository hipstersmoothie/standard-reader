import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { ArrowRight, Flame, Sparkles } from "lucide-react";
import { Suspense, useEffect } from "react";
import { z } from "zod";

import { ButtonLink } from "#/components/router-links";
import { DirectionalIcon } from "#/design-system/directional-icon";
import type { Formatters } from "#/lib/formatters";
import { DEFAULT_TRACK_READING_HISTORY } from "#/lib/track-reading-history";
import { useFormatters } from "#/lib/use-formatters";

import {
  ArticleRow,
  FeatureArticle,
  MiniPubRow,
} from "../components/reader/cards";
import { Masthead, ReaderContent } from "../components/reader/primitives";
import { Flex } from "../design-system/flex";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../design-system/segmented-control";
import { Skeleton } from "../design-system/skeleton";
import { primaryColor, uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
} from "../design-system/theme/typography.stylex";
import type { HomeScope } from "../integrations/tanstack-query/api-feed.functions";
import { feedApi } from "../integrations/tanstack-query/api-feed.functions";
import { user } from "../integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "../lib/public-url";
import { latestFeedUrl, pageSocialMeta } from "../lib/site-metadata";
import { useHomeScope } from "../lib/use-home-scope";

const homeSearchSchema = z.object({
  scope: z.enum(["follows", "trending"]).optional(),
});

export const Route = createFileRoute("/_layout/")({
  validateSearch: homeSearchSchema,
  // First-run gate: a signed-in reader who hasn't finished onboarding and
  // follows nothing is sent to the wizard. Guests and readers who already have
  // follows (or completed onboarding) fall through. Both queries are seeded by
  // the root bootstrap + `_layout` loader, so this is normally two cache reads.
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user || session.onboardingCompleted) {
      return;
    }
    // Only need the boolean here — a cheap EXISTS check, not the full sidebar
    // computation (which the app shell fetches client-side after paint).
    const { hasFollows } = await context.queryClient.ensureQueryData(
      feedApi.getHasFollowsQueryOptions(),
    );
    if (!hasFollows) {
      throw redirect({ to: "/welcome" });
    }
  },
  loaderDeps: ({ search }) => ({ scope: search.scope }),
  loader: async ({ context, deps }) => {
    const { queryClient } = context;

    // Cache-first, mirroring /latest. Reading an article optimistically flips its
    // card to read in the home-feed cache (see applyMarkReadOptimisticUpdate)
    // without dropping it from the list. Blindly re-running getHomePage() on every
    // navigation and overwriting the cache with setQueryData would clobber those
    // edits and hand back a server-recomputed feed with the just-read article gone
    // or reordered — so the list jumps under the reader on Back. When the feed is
    // still fresh in the cache, reuse it and skip the fetch, so the just-read
    // article stays put and the feed stays intact for browsing.
    const session = queryClient.getQueryData(
      user.getSessionQueryOptions.queryKey,
    );
    const readerScope = user.readerQueryScope(session);
    const cachedScope = queryClient.getQueryData(
      user.getHomeScopePreferenceQueryOptions.queryKey,
    )?.scope;
    const scope = deps.scope ?? cachedScope ?? "follows";

    const feedOptions = feedApi.getHomeFeedQueryOptions({ scope, readerScope });
    const feedStaleTime =
      typeof feedOptions.staleTime === "number" ? feedOptions.staleTime : 0;
    const feedQuery = queryClient.getQueryCache().find({
      queryKey: feedOptions.queryKey,
    });
    if (
      feedQuery?.state.data !== undefined &&
      !feedQuery.isStaleByTime(feedStaleTime)
    ) {
      return { scope, readerScope };
    }

    const page = await feedApi.getHomePage({
      data: { scope: deps.scope },
    });
    queryClient.setQueryData(user.getHomeScopePreferenceQueryOptions.queryKey, {
      scope: page.scope,
    });
    queryClient.setQueryData(
      feedApi.getHomeFeedQueryOptions({
        scope: page.scope,
        readerScope: page.readerScope,
      }).queryKey,
      page.feed,
    );
    // The Trending / You-might-follow rails are below the fold — leave the
    // extras query unseeded so it fetches client-side after first paint (the
    // rails render their skeletons meanwhile) instead of blocking SSR on the
    // recommendation scans.

    return { scope: page.scope, readerScope: page.readerScope };
  },
  head: ({ loaderData }) => {
    const baseUrl = getPublicUrlClient();
    const did = loaderData?.readerScope;
    return {
      meta: pageSocialMeta("today", baseUrl),
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
  component: Home,
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
    marginBottom: spacing["8"],
    rowGap: spacing["3"],
  },
  segmentedControlResponsive: {
    width: { default: "100%", "@media (min-width: 40rem)": "auto" },
  },
  twoCol: {
    alignItems: "start",
    columnGap: spacing["12"],
    display: "grid",
    // `minmax(0, 1fr)`, not a bare `1fr` — a bare `1fr` is `minmax(auto, 1fr)`,
    // so the track keeps an automatic min-content floor and refuses to shrink
    // below its widest unbreakable content (long `@handle`s in the rail cards).
    // That pushed the track ~22px past the grid on narrow viewports and spilled
    // the whole page sideways; the shell's `overflow-x: clip` was hiding it.
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (min-width: 64rem)": "minmax(0, 1fr) 320px",
    },
    rowGap: spacing["12"],
    marginTop: spacing["9"],
  },
  railCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    backgroundColor: uiColor.bgSubtle,
    boxSizing: "border-box",
    paddingBottom: spacing["2"],
    paddingInlineStart: spacing["5"],
    paddingInlineEnd: spacing["5"],
    paddingTop: spacing["5"],
  },
  railHead: {
    alignItems: "center",
    color: uiColor.text2,
    columnGap: spacing["2"],
    display: "flex",
    fontFamily: fontFamily.sans,
    fontSize: "0.7rem",
    fontWeight: fontWeight.bold,
    letterSpacing: tracking.widest,
    rowGap: spacing["2"],
    textTransform: "uppercase",
    borderBottomColor: uiColor.border1,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    paddingBottom: spacing["3"],
  },
  railIcon: { color: primaryColor.text2 },
  directoryLink: {
    display: "inline-block",
    marginTop: spacing["2"],
  },
  viewAll: {
    width: "100%",
  },
  emptyCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    marginTop: spacing["6"],
    paddingBottom: spacing["10"],
    paddingInlineStart: spacing["8"],
    paddingInlineEnd: spacing["8"],
    paddingTop: spacing["10"],
  },
  emptyTitle: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.medium,
    letterSpacing: tracking.tight,
    lineHeight: lineHeight.sm,
  },
  emptyDek: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    maxWidth: "52ch",
  },
  // The same empty card, but sitting at the top of the two-column grid's main
  // track — so it must start flush with the rail cards beside it, not `6` down.
  caughtUpCard: {
    marginTop: spacing["0"],
  },
  caughtUpActions: {
    flexWrap: "wrap",
  },
  homeSkeleton: {
    marginTop: spacing["9"],
  },
  railRows: {
    paddingTop: spacing["2"],
  },
  railGrow: {
    flexGrow: 1,
  },
  railMiniRowSkeleton: {
    alignItems: "center",
    paddingBottom: spacing["4"],
    paddingTop: spacing["4"],
  },
  railMiniRowSkeletonLast: {
    paddingBottom: spacing["0"],
  },
  railLinkSkeleton: {
    marginTop: spacing["3"],
  },
});

function homeMastheadKicker(
  i18n: I18n,
  weekday: string,
  personalized: boolean,
): string {
  return personalized
    ? i18n._(msg`${weekday} · Your feed`)
    : i18n._(msg`${weekday} · Across the network`);
}

function homeFeedLabels({
  i18n,
  fmt,
  weekday,
  today,
  personalized,
  trackReading,
  unreadCount,
  unreadCountPending = false,
  isTrending = false,
  caughtUp = false,
}: {
  i18n: I18n;
  fmt: Formatters;
  weekday: string;
  today: string;
  personalized: boolean;
  trackReading: boolean;
  unreadCount: number | null | undefined;
  unreadCountPending?: boolean;
  isTrending?: boolean;
  caughtUp?: boolean;
}) {
  if (isTrending) {
    return {
      kicker: i18n._(msg`${weekday} · Trending`),
      dek: i18n._(msg`The most-read writing across the network right now.`),
      metaLabel: today,
      unreadLabel: undefined,
      sectionKicker: i18n._(msg`Across the network`),
      sectionTitle: i18n._(msg`Trending`),
    };
  }

  // Caught up: the masthead shouldn't announce "0 new" like it's a shortfall,
  // and the dek can't say "0 unread across the publications you subscribe to"
  // when there is simply nothing left to read. Both swap to the caught-up voice.
  if (caughtUp) {
    return {
      kicker: homeMastheadKicker(i18n, weekday, personalized),
      dek: trackReading
        ? i18n._(msg`You've read everything from the publications you follow.`)
        : i18n._(
            msg`The publications you follow haven't published anything recently.`,
          ),
      metaLabel: today,
      unreadLabel: trackReading ? i18n._(msg`Caught up`) : undefined,
    };
  }

  const newCount = unreadCount == null ? "" : fmt.compactNumber(unreadCount);
  const unreadLabel = trackReading
    ? unreadCountPending || unreadCount == null
      ? undefined
      : i18n._(msg`${newCount} new`)
    : i18n._(msg`Fresh`);
  const subscribedCount = fmt.compactNumber(unreadCount ?? 0);
  const dek = personalized
    ? trackReading
      ? unreadCountPending
        ? i18n._(
            msg`The latest writing from the publications you subscribe to.`,
          )
        : i18n._(
            msg`${subscribedCount} unread across the publications you subscribe to.`,
          )
      : i18n._(msg`The latest writing from the publications you subscribe to.`)
    : i18n._(msg`The latest long-form writing from across the network.`);

  return {
    kicker: homeMastheadKicker(i18n, weekday, personalized),
    dek,
    metaLabel: today,
    unreadLabel,
  };
}

function HomeFeedSkeleton() {
  const { t } = useLingui();

  return (
    <ReaderContent>
      <div aria-busy="true" aria-label={t`Loading today`}>
        <Flex direction="column" gap="3xl">
          <Skeleton variant="rectangle" height={spacing["4"]} width="36%" />
          <Skeleton variant="rectangle" height={spacing["10"]} width="42%" />
          <Skeleton variant="rectangle" height={spacing["5"]} width="68%" />
        </Flex>
        <Flex
          direction="column"
          gap="2xl"
          style={styles.homeSkeleton}
          aria-hidden
        >
          <Skeleton variant="rectangle" height={spacing["48"]} width="100%" />
          <Skeleton variant="rectangle" height={spacing["24"]} width="100%" />
          <Skeleton variant="rectangle" height={spacing["24"]} width="100%" />
        </Flex>
      </div>
    </ReaderContent>
  );
}

const FOLLOW_RAIL_SKELETON_ROWS = 3;

function HomeYouMightFollowRailSkeleton() {
  const { t } = useLingui();

  return (
    <div
      {...stylex.props(styles.railCard)}
      aria-label={t`Loading recommendations`}
    >
      <div {...stylex.props(styles.railHead)}>
        <Sparkles size={14} {...stylex.props(styles.railIcon)} />{" "}
        <Trans>You might follow</Trans>
      </div>
      <Flex direction="column" style={styles.railRows} aria-hidden>
        {Array.from({ length: FOLLOW_RAIL_SKELETON_ROWS }, (_, index) => (
          <Flex
            key={index}
            gap="md"
            style={[
              styles.railMiniRowSkeleton,
              index === FOLLOW_RAIL_SKELETON_ROWS - 1 &&
                styles.railMiniRowSkeletonLast,
            ]}
          >
            <Skeleton variant="circle" size="lg" />
            <Flex direction="column" gap="sm" style={styles.railGrow}>
              <Skeleton variant="rectangle" height={spacing["5"]} width="48%" />
              <Skeleton
                variant="rectangle"
                height={spacing["3.5"]}
                width="36%"
              />
            </Flex>
            <Skeleton
              variant="rectangle"
              height={spacing["4"]}
              width={spacing["4"]}
            />
          </Flex>
        ))}
      </Flex>
      <Skeleton
        variant="rectangle"
        height={spacing["8"]}
        width="52%"
        style={styles.railLinkSkeleton}
      />
    </div>
  );
}

function useEffectiveHomeScope(): HomeScope {
  const searchScope = Route.useSearch().scope;
  const { scope } = Route.useLoaderData();
  return searchScope ?? scope;
}

function useHomeReaderScope(): string {
  const { readerScope: loaderScope } = Route.useLoaderData();
  const { data: session } = useQuery(user.getSessionQueryOptions);
  return session === undefined ? loaderScope : user.readerQueryScope(session);
}

function Home() {
  const scope = useEffectiveHomeScope();
  const readerScope = useHomeReaderScope();

  return (
    <Suspense key={`${scope}:${readerScope}`} fallback={<HomeFeedSkeleton />}>
      <HomeFeed scope={scope} readerScope={readerScope} />
    </Suspense>
  );
}

function HomeFeed({
  scope,
  readerScope,
}: {
  scope: HomeScope;
  readerScope: string;
}) {
  const { i18n } = useLingui();
  const fmt = useFormatters();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const { setScope } = useHomeScope();
  const { data: feed } = useSuspenseQuery({
    ...feedApi.getHomeFeedQueryOptions({ scope, readerScope }),
    refetchOnMount: false,
  });
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const { data: sidebar } = useQuery({
    ...feedApi.getSidebarQueryOptions(),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const { data: trackReadingPref } = useQuery({
    ...user.getTrackReadingHistoryPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const signedIn = Boolean(session?.user);
  const isTrending = scope === "trending";
  const showNetworkFeed = isTrending || !feed.personalized;
  const trackReading =
    signedIn && !showNetworkFeed
      ? (trackReadingPref?.enabled ?? DEFAULT_TRACK_READING_HISTORY)
      : false;

  const hasMainContent = Boolean(
    feed.featured ||
    feed.latestUnread.length > 0 ||
    feed.personalized ||
    isTrending,
  );

  const { data: extras, isPending: extrasPending } = useQuery({
    ...feedApi.getHomeExtrasQueryOptions({ scope, readerScope }),
    enabled: hasMainContent,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Warm the opposite tab's route data so toggling scope is instant — otherwise
  // the switch blocks on a fresh loader round-trip and flashes the skeleton.
  // Only worthwhile when the scope toggle is actually shown.
  const canToggleScope = signedIn && (sidebar?.hasFollows ?? feed.hasFollows);
  const otherScope: HomeScope = isTrending ? "follows" : "trending";
  useEffect(() => {
    if (!canToggleScope) return;
    void router.preloadRoute({
      to: Route.fullPath,
      search: { scope: otherScope },
    });
  }, [router, canToggleScope, otherScope]);

  // Trending articles (main column on the Trending tab) and trending
  // publications (sidebar) ship in the critical feed payload (above the fold,
  // no loader); only the "You might follow" rail is deferred to `extras`.
  const mainArticles = isTrending ? feed.trending : feed.latestUnread;
  const trendingPubs = feed.trendingPublications;
  const youMightFollow = extras?.youMightFollow ?? feed.youMightFollow;
  const unreadCount =
    trackReading && feed.personalized
      ? (sidebar?.unreadCount ?? extras?.unreadCount ?? feed.unreadCount)
      : 0;
  const unreadCountPending =
    trackReading && feed.personalized && unreadCount == null;

  const onScopeChange = (keys: Set<React.Key> | "all") => {
    const next = keys === "all" ? "follows" : [...keys][0];
    if (next === "follows" || next === "trending") {
      setScope(next);
      void navigate({ search: { scope: next }, resetScroll: false });
    }
  };

  // A reader with follows who has read everything: `selectArticleCards` runs
  // unread-only when tracking is on, so the feed comes back with no lead and no
  // rows while `personalized` stays true. The guest/no-follows empty branch below
  // requires `!personalized`, so without this the main column renders as a bare
  // "View all latest" button under an empty list.
  const isCaughtUp =
    !isTrending &&
    feed.personalized &&
    !feed.featured &&
    mainArticles.length === 0;

  const nowIso = new Date().toISOString();
  const labels = homeFeedLabels({
    i18n,
    fmt,
    weekday: fmt.weekday(nowIso),
    today: fmt.longDate(nowIso),
    personalized: feed.personalized,
    trackReading,
    unreadCount,
    unreadCountPending,
    isTrending,
    caughtUp: isCaughtUp,
  });

  if (
    !isTrending &&
    !feed.personalized &&
    feed.latestUnread.length === 0 &&
    !feed.featured
  ) {
    return (
      <ReaderContent>
        <Masthead
          kicker={<Trans>Your reading room</Trans>}
          title={<Trans>A quiet place to begin</Trans>}
          dek={
            <Trans>
              Subscribe to a few publications or follow some people, and their
              latest writing and recommendations will collect here.
            </Trans>
          }
        />
        <Flex direction="column" gap="2xl" style={styles.emptyCard}>
          <span {...stylex.props(styles.emptyTitle)}>
            <Trans>Wander the directory</Trans>
          </span>
          <span {...stylex.props(styles.emptyDek)}>
            <Trans>
              Standard Reader knows about every publication on the network. Find
              a few worth your mornings.
            </Trans>
          </span>
          <Flex>
            <ButtonLink to="/discover">
              <Trans>Explore the directory</Trans>
            </ButtonLink>
          </Flex>
        </Flex>
      </ReaderContent>
    );
  }

  const showScopeToggle = canToggleScope;

  return (
    <ReaderContent>
      <Masthead
        kicker={labels.kicker}
        title={<Trans>Today</Trans>}
        dek={
          unreadCountPending ? (
            <Skeleton variant="rectangle" height={spacing["5"]} width="68%" />
          ) : (
            labels.dek
          )
        }
        metaLabel={labels.metaLabel}
        metaValue={
          unreadCountPending ? (
            <Skeleton
              variant="rectangle"
              height={spacing["8"]}
              width={spacing["16"]}
            />
          ) : (
            labels.unreadLabel
          )
        }
      />

      {showScopeToggle ? (
        <div {...stylex.props(styles.controls)}>
          <SegmentedControl
            selectedKeys={new Set([scope])}
            onSelectionChange={onScopeChange}
            size="lg"
            style={styles.segmentedControlResponsive}
          >
            <SegmentedControlItem id="follows">
              <Trans>Subscriptions</Trans>
            </SegmentedControlItem>
            <SegmentedControlItem id="trending">
              <Trans>Trending</Trans>
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
      ) : null}

      {feed.featured ? <FeatureArticle article={feed.featured} /> : null}

      <div {...stylex.props(styles.twoCol)}>
        <Flex direction="column">
          {isCaughtUp ? (
            <Flex
              direction="column"
              gap="2xl"
              style={[styles.emptyCard, styles.caughtUpCard]}
            >
              <span {...stylex.props(styles.emptyTitle)}>
                {trackReading ? (
                  <Trans>You're all caught up</Trans>
                ) : (
                  <Trans>Nothing new today</Trans>
                )}
              </span>
              <span {...stylex.props(styles.emptyDek)}>
                {trackReading ? (
                  <Trans>
                    Nothing left unread from the publications you follow.
                    There's more on the network than you're following yet.
                  </Trans>
                ) : (
                  <Trans>
                    Your subscriptions have been quiet. The directory knows
                    about every publication on the network — there's more to
                    find.
                  </Trans>
                )}
              </span>
              <Flex gap="md" style={styles.caughtUpActions}>
                <ButtonLink to="/discover">
                  <Trans>Explore the directory</Trans>
                </ButtonLink>
                <ButtonLink to="/latest" variant="secondary">
                  <Trans>View all latest</Trans>
                </ButtonLink>
              </Flex>
            </Flex>
          ) : (
            <div>
              {mainArticles.map((article, index) => (
                <ArticleRow
                  key={article.uri}
                  article={article}
                  showSaveButton={false}
                  isFirstInSection={index === 0}
                />
              ))}
            </div>
          )}
          {isCaughtUp ? null : isTrending ? (
            <ButtonLink
              to="/latest"
              search={{ filter: "trending" }}
              variant="secondary"
              size="lg"
              style={styles.viewAll}
            >
              <Trans>See all trending</Trans>{" "}
              <DirectionalIcon as={ArrowRight} size={15} />
            </ButtonLink>
          ) : session?.user ? (
            <ButtonLink
              to="/latest"
              variant="secondary"
              size="lg"
              style={styles.viewAll}
            >
              <Trans>View all latest</Trans>{" "}
              <DirectionalIcon as={ArrowRight} size={15} />
            </ButtonLink>
          ) : null}
        </Flex>

        <Flex direction="column" gap="2xl">
          {trendingPubs.length > 0 ? (
            <div {...stylex.props(styles.railCard)}>
              <div {...stylex.props(styles.railHead)}>
                <Flame size={14} {...stylex.props(styles.railIcon)} />{" "}
                <Trans>Trending publications</Trans>
              </div>
              <div>
                {trendingPubs.slice(0, 3).map((pub, i, pubs) => (
                  <MiniPubRow
                    key={pub.uri}
                    pub={pub}
                    isLast={i === pubs.length - 1}
                  />
                ))}
              </div>
              <ButtonLink
                to="/discover"
                variant="tertiary"
                size="sm"
                style={styles.directoryLink}
              >
                <Trans>Open the directory</Trans>{" "}
                <DirectionalIcon as={ArrowRight} size={14} />
              </ButtonLink>
            </div>
          ) : null}

          {extrasPending ? (
            <HomeYouMightFollowRailSkeleton />
          ) : youMightFollow.length > 0 ? (
            <div {...stylex.props(styles.railCard)}>
              <div {...stylex.props(styles.railHead)}>
                <Sparkles size={14} {...stylex.props(styles.railIcon)} />{" "}
                <Trans>You might follow</Trans>
              </div>
              <div>
                {youMightFollow.slice(0, 3).map((pub, i, pubs) => (
                  <MiniPubRow
                    key={pub.uri}
                    pub={pub}
                    isLast={i === pubs.length - 1}
                  />
                ))}
              </div>
              <ButtonLink
                to="/discover"
                variant="tertiary"
                size="sm"
                style={styles.directoryLink}
              >
                <Trans>Open the directory</Trans>{" "}
                <DirectionalIcon as={ArrowRight} size={14} />
              </ButtonLink>
            </div>
          ) : null}
        </Flex>
      </div>
    </ReaderContent>
  );
}
