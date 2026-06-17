"use client";

import * as stylex from "@stylexjs/stylex";
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ButtonLink } from "#/components/router-links";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";
import { Heart } from "lucide-react";
import { useCallback } from "react";

import {
  Handle,
  Masthead,
  ReaderContent,
  SectionHead,
} from "../components/reader/primitives";
import { ReaderQueueRows } from "../components/reader/reader-queue-rows";
import { useInfiniteScrollSentinel } from "../components/reader/use-infinite-scroll-sentinel";
import { Avatar } from "../design-system/avatar";
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

export const Route = createFileRoute("/_layout/likes")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/likes") },
      });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureInfiniteQueryData(
      readerApi.getLikesInfiniteQueryOptions(),
    );
  },
  head: () => ({
    meta: pageSocialMeta("likes", getPublicUrlClient()),
  }),
  component: ReaderLikes,
});

const styles = stylex.create({
  profile: {
    alignItems: "center",
    columnGap: spacing["4"],
    display: "flex",
    rowGap: spacing["4"],
    marginBottom: spacing["8"],
  },
  profileName: {
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.sm,
    marginBottom: spacing["0"],
    marginTop: spacing["0"],
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
    paddingLeft: spacing["8"],
    paddingRight: spacing["8"],
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
    overflowWrap: "anywhere",
    maxWidth: "52ch",
    minWidth: 0,
  },
  emptyCode: {
    fontFamily: fontFamily.mono,
    fontSize: "0.88em",
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
    textAlign: "center",
    marginTop: spacing["6"],
  },
});

function ReaderLikes() {
  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(readerApi.getLikesInfiniteQueryOptions());

  const likes = data.pages.flatMap((page) => page.items);
  const total = data.pages[0]?.total ?? 0;
  const userName = session?.user.name ?? "Reader";
  const userHandle = session?.user.handle;
  const initial = userName.charAt(0).toUpperCase();

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const loadMoreRef = useInfiniteScrollSentinel(
    loadMore,
    hasNextPage,
    likes.length,
  );

  const queueRows = likes.map((item) => ({
    id: item.recommendUri,
    documentUri: item.documentUri,
    article: item.article,
    timestamp: item.likedAt,
    actionLabel: "Liked",
  }));

  return (
    <ReaderContent>
      <Masthead
        kicker="Your profile"
        kickerIcon={<Heart size={14} aria-hidden />}
        title="Liked articles"
        dek="Articles you've liked across the network."
        metaLabel="Likes"
        metaValue={String(total)}
      />

      <div {...stylex.props(styles.profile)}>
        <Avatar
          size="xl"
          src={session?.user.image ?? undefined}
          fallback={initial}
          alt={userName}
        />
        <Flex direction="column" gap="xs">
          <p {...stylex.props(styles.profileName)}>{userName}</p>
          {userHandle ? <Handle>@{userHandle}</Handle> : null}
        </Flex>
      </div>

      {total === 0 ? (
        <div {...stylex.props(styles.emptyCard)}>
          <Flex
            direction="column"
            gap="lg"
            align="start"
            style={styles.emptyInner}
          >
            <span {...stylex.props(styles.emptyTitle)}>No likes yet</span>
            <p {...stylex.props(styles.emptyDek)}>
              Tap the heart on any article to like it. Your likes live in your
              repo as{" "}
              <code {...stylex.props(styles.emptyCode)}>
                site.standard.graph.recommend
              </code>{" "}
              records and help surface great writing across the network.
            </p>
            <ButtonLink to="/" variant="secondary" size="lg">
              Browse your feed
            </ButtonLink>
          </Flex>
        </div>
      ) : (
        <>
          <SectionHead kicker="Likes" title="Recently liked" />
          <ReaderQueueRows items={queueRows} showSaveButton={false} />
          {isFetchingNextPage ? (
            <p {...stylex.props(styles.loadingNote)}>Loading…</p>
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
