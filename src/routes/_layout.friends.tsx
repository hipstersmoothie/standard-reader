"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";

import { ButtonLink } from "#/components/router-links";
import { discoverApi } from "#/integrations/tanstack-query/api-discover.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import {
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

export const Route = createFileRoute("/_layout/friends")({
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
    // it streams into the skeleton rather than gating first paint.
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
  list: {
    marginTop: spacing["6"],
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
 * Only fills gaps (`prev ?? next`) — an optimistic update from a Subscribe
 * press must always win over this snapshot.
 */
function useSeededFollowStatus(
  publications: Array<PublicationCard>,
  subscribedUris: Array<string>,
) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const subscribed = new Set(subscribedUris);
    for (const pub of publications) {
      queryClient.setQueryData(
        readerApi.getFollowStatusQueryOptions(pub.uri).queryKey,
        (prev) => prev ?? { isFollowing: subscribed.has(pub.uri) },
      );
    }
  }, [publications, subscribedUris, queryClient]);
}

function FriendsPage() {
  const { t } = useLingui();
  const {
    data,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(discoverApi.getFriendPublishersInfiniteQueryOptions());

  const first = data?.pages[0];
  // A failed request and a partial Bluesky sweep get the same treatment: say we
  // couldn't check, never "nobody you follow publishes here".
  const couldNotCheck = isError || (first?.degraded ?? false);
  const publications = useMemo(
    () => data?.pages.flatMap((page) => page.publications) ?? [],
    [data],
  );
  const subscribedUris = useMemo(
    () => data?.pages.flatMap((page) => page.subscribedUris) ?? [],
    [data],
  );

  useSeededFollowStatus(publications, subscribedUris);

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

  return (
    <ReaderContent>
      <Masthead
        kicker={t`Discover`}
        title={t`People you follow`}
        dek={t`Publications written by the people you follow on Bluesky.`}
        metaLabel={t`Publications`}
        metaValue={first ? String(first.publicationCount) : undefined}
      />

      {isPending ? (
        <div {...stylex.props(styles.list)}>
          {Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <PubDirectoryRowSkeleton
              key={index}
              isFirstInSection={index === 0}
              isLast={index === SKELETON_ROWS - 1}
            />
          ))}
        </div>
      ) : publications.length === 0 ? (
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
                <Trans>No one you follow publishes here yet</Trans>
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
                  We checked the people you follow on Bluesky against every
                  publication on the network and didn't find a match. As more of
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
        </>
      )}
    </ReaderContent>
  );
}
