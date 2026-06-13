"use client";

import * as stylex from "@stylexjs/stylex";
import {
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";
import { Bookmark } from "lucide-react";
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
import { Button } from "../design-system/button";
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

export const Route = createFileRoute("/_layout/saved")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/saved") },
      });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureInfiniteQueryData(
      readerApi.getSavedInfiniteQueryOptions(),
    );
  },
  head: () => ({
    meta: pageSocialMeta("saved", getPublicUrlClient()),
  }),
  component: ReaderSaved,
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

function ReaderSaved() {
  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(readerApi.getSavedInfiniteQueryOptions());

  const saved = data.pages.flatMap((page) => page.items);
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
    saved.length,
  );

  const queueRows = saved.map((item) => ({
    id: item.bookmarkUri,
    documentUri: item.documentUri,
    article: item.article,
    timestamp: item.savedAt,
    actionLabel: "Saved",
  }));

  return (
    <ReaderContent>
      <Masthead
        kicker="Your profile"
        kickerIcon={<Bookmark size={14} aria-hidden />}
        title="Saved for later"
        dek="Articles you've saved for later — in your repo, synced across devices."
        metaLabel="Saved"
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
            <span {...stylex.props(styles.emptyTitle)}>Nothing saved yet</span>
            <p {...stylex.props(styles.emptyDek)}>
              Tap the bookmark on any article to save it here. Your queue lives
              in your repo as{" "}
              <code {...stylex.props(styles.emptyCode)}>
                app.standard-reader.bookmark
              </code>{" "}
              records in your repo.
            </p>
            <Link to="/">
              <Button variant="secondary" size="lg">
                Browse your feed
              </Button>
            </Link>
          </Flex>
        </div>
      ) : (
        <>
          <SectionHead kicker="Queue" title="Recently saved" />
          <ReaderQueueRows
            items={queueRows}
            saveButtonPlacement="besideMedia"
            assumeBookmarked
          />
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
