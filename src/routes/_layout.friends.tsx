"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { z } from "zod";

import { isArticleUnreadForReader } from "#/components/reader/read-optimistic";
import { ButtonLink } from "#/components/router-links";
import { Tab, TabList, TabPanel, Tabs } from "#/design-system/tabs";
import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { useHasMounted } from "#/lib/use-has-mounted";
import { useTrackReadingHistory } from "#/lib/use-track-reading-history";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import {
  ArticleRow,
  PubDirectoryRow,
  PubDirectoryRowSkeleton,
} from "../components/reader/cards";
import {
  FriendPublishersDegradedNote,
  FriendPublishersSummary,
} from "../components/reader/friend-publishers";
import { Masthead, ReaderContent } from "../components/reader/primitives";
import { useInfiniteScrollSentinel } from "../components/reader/use-infinite-scroll-sentinel";
import { Flex } from "../design-system/flex";
import { uiColor } from "../design-system/theme/color.stylex";
import { radius } from "../design-system/theme/radius.stylex";
import { spacing } from "../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../design-system/theme/typography.stylex";
import type { PublicationCard } from "../integrations/tanstack-query/api-shapes";

const SKELETON_ROWS = 6;

const friendsSearchSchema = z.object({
  // Publications lead: the page exists to get the reader subscribed, and the
  // articles are what those publications happen to have published lately.
  view: z.enum(["publications", "articles"]).default("publications"),
});

type FriendsView = z.infer<typeof friendsSearchSchema>["view"];

export const Route = createFileRoute("/_layout/friends")({
  validateSearch: friendsSearchSchema,
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/friends") },
      });
    }
  },
  loader: ({ context }) => {
    // The Bluesky round trip is the slow part (batched `getRelationships`), so
    // it streams into the skeleton rather than gating first paint. Both tabs
    // share the server-side graph cache, so warming one warms the other.
    void context.queryClient.prefetchInfiniteQuery(
      discoverApi.getFriendPublishersInfiniteQueryOptions(),
    );
  },
  head: () => ({
    meta: pageSocialMeta("friends", getPublicUrlClient()),
  }),
  component: FriendsPage,
});

const styles = stylex.create({
  summary: {
    marginTop: spacing["6"],
  },
  tabList: {
    marginTop: spacing["6"],
  },
  tabPanel: {
    paddingInlineEnd: spacing["0"],
    paddingInlineStart: spacing["0"],
    paddingTop: spacing["2"],
  },
  list: {
    marginTop: spacing["4"],
  },
  emptyCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    marginTop: spacing["6"],
    maxWidth: "100%",
    paddingBottom: spacing["10"],
    paddingInlineStart: spacing["8"],
    paddingInlineEnd: spacing["8"],
    paddingTop: spacing["10"],
    width: "100%",
  },
  emptyInner: {
    minWidth: 0,
    width: "100%",
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
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  emptyNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    marginTop: spacing["8"],
    maxWidth: "60ch",
    overflowWrap: "anywhere",
  },
  loadSentinel: {
    height: 1,
    marginTop: spacing["6"],
    width: "100%",
  },
  loadingNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    marginTop: spacing["6"],
    textAlign: "center",
  },
});

/**
 * Seed the per-publication follow-status cache from the payload we already
 * have, so a page of two dozen rows doesn't fire two dozen status requests.
 * Every row here is unsubscribed by construction; `prev ?? next` means an
 * optimistic update from a Subscribe press still wins.
 */
function useSeededFollowStatus(publications: Array<PublicationCard>) {
  const queryClient = useQueryClient();
  useEffect(() => {
    for (const pub of publications) {
      queryClient.setQueryData(
        readerApi.getFollowStatusQueryOptions(pub.uri).queryKey,
        (prev) => prev ?? { isFollowing: false },
      );
    }
  }, [publications, queryClient]);
}

function FriendsPage() {
  const { t } = useLingui();
  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();
  // See `useHasMounted`: the list is prefetched off the critical path, so SSR
  // must render the skeleton rather than whatever the server happened to
  // resolve mid-render.
  const mounted = useHasMounted();

  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(discoverApi.getFriendPublishersInfiniteQueryOptions());

  const first = mounted ? data?.pages[0] : undefined;
  // A failed request and a partial Bluesky sweep get the same treatment: say we
  // couldn't check, never "nobody you follow publishes here".
  const couldNotCheck = isError || (first?.degraded ?? false);
  const publications = useMemo(
    () =>
      mounted ? (data?.pages.flatMap((page) => page.publications) ?? []) : [],
    [data, mounted],
  );

  useSeededFollowStatus(publications);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const loadMoreRef = useInfiniteScrollSentinel(
    loadMore,
    hasNextPage,
    publications.length,
  );

  const onViewChange = (key: React.Key) => {
    void navigate({ search: { view: key as FriendsView }, replace: true });
  };

  const showEmpty = mounted && !isPending && publications.length === 0;

  return (
    <ReaderContent>
      <Masthead
        kicker={t`Discover`}
        title={t`People you follow`}
        dek={t`Publications written by the people you follow on Bluesky, minus the ones you already subscribe to.`}
        metaLabel={t`Publications`}
        metaValue={first ? String(first.publicationCount) : undefined}
      />

      {!mounted || isPending ? (
        <div {...stylex.props(styles.list)}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <PubDirectoryRowSkeleton
              key={index}
              isFirstInSection={index === 0}
              isLast={index === SKELETON_ROWS - 1}
            />
          ))}
        </div>
      ) : showEmpty ? (
        <div {...stylex.props(styles.emptyCard)}>
          <Flex
            direction="column"
            gap="lg"
            align="start"
            style={styles.emptyInner}
          >
            <span {...stylex.props(styles.emptyTitle)}>
              {couldNotCheck ? (
                <Trans>Couldn't check right now</Trans>
              ) : (
                <Trans>Nothing new from the people you follow</Trans>
              )}
            </span>
            <p {...stylex.props(styles.emptyDek)}>
              {couldNotCheck ? (
                <Trans>
                  We couldn't reach Bluesky to look up who you follow. Reload in
                  a moment, or browse the directory in the meantime.
                </Trans>
              ) : (
                <Trans>
                  Either no one you follow on Bluesky publishes here yet, or
                  you're already subscribed to everyone who does. As more of
                  them start publishing, they'll show up here.
                </Trans>
              )}
            </p>
            <ButtonLink to="/discover" variant="secondary" size="lg">
              <Trans>Browse the directory</Trans>
            </ButtonLink>
          </Flex>
        </div>
      ) : (
        <>
          <div {...stylex.props(styles.summary)}>
            <FriendPublishersSummary
              people={first?.totalPeople ?? 0}
              publicationCount={first?.publicationCount ?? 0}
            />
            {couldNotCheck ? <FriendPublishersDegradedNote /> : null}
          </div>

          <Tabs selectedKey={view} onSelectionChange={onViewChange}>
            <TabList aria-label={t`Friends views`} style={styles.tabList}>
              <Tab id="publications">
                <Trans>Publications</Trans>
              </Tab>
              <Tab id="articles">
                <Trans>Articles</Trans>
              </Tab>
            </TabList>

            <TabPanel id="publications" style={styles.tabPanel}>
              <div {...stylex.props(styles.list)}>
                {publications.map((pub, index) => (
                  <PubDirectoryRow
                    key={pub.uri}
                    pub={pub}
                    isFirstInSection={index === 0}
                    isLast={index === publications.length - 1}
                  />
                ))}
              </div>
              {isFetchingNextPage ? (
                <p {...stylex.props(styles.loadingNote)}>
                  <Trans>Loading…</Trans>
                </p>
              ) : null}
              {hasNextPage ? (
                <div
                  ref={loadMoreRef}
                  aria-hidden
                  {...stylex.props(styles.loadSentinel)}
                />
              ) : null}
            </TabPanel>

            <TabPanel id="articles" style={styles.tabPanel}>
              {view === "articles" ? <FriendArticlesPanel /> : null}
            </TabPanel>
          </Tabs>
        </>
      )}
    </ReaderContent>
  );
}

/**
 * Chronological writing from the same publications the other tab lists. Mounted
 * only while its tab is selected, so an unvisited tab costs no request.
 */
function FriendArticlesPanel() {
  const { t } = useLingui();
  const mounted = useHasMounted();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(user.getSessionQueryOptions);
  const signedIn = Boolean(session?.user);
  const { enabled: trackReading } = useTrackReadingHistory();

  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(discoverApi.getFriendArticlesInfiniteQueryOptions());

  const items = useMemo(
    () => (mounted ? (data?.pages.flatMap((page) => page.items) ?? []) : []),
    [data, mounted],
  );

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const loadMoreRef = useInfiniteScrollSentinel(
    loadMore,
    hasNextPage,
    items.length,
  );

  if (!mounted || isPending) {
    return (
      <div
        {...stylex.props(styles.list)}
        aria-busy="true"
        aria-label={t`Loading articles`}
      >
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <PubDirectoryRowSkeleton
            key={index}
            isFirstInSection={index === 0}
            isLast={index === SKELETON_ROWS - 1}
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p {...stylex.props(styles.emptyNote)}>
        <Trans>
          None of these publications have posted anything yet. Subscribe from
          the Publications tab and their writing will land on your Home feed.
        </Trans>
      </p>
    );
  }

  return (
    <>
      <div {...stylex.props(styles.list)}>
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
      {isFetchingNextPage ? (
        <p {...stylex.props(styles.loadingNote)}>
          <Trans>Loading…</Trans>
        </p>
      ) : null}
      {hasNextPage ? (
        <div
          ref={loadMoreRef}
          aria-hidden
          {...stylex.props(styles.loadSentinel)}
        />
      ) : null}
    </>
  );
}
