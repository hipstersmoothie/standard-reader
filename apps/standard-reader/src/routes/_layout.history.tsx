"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback } from "react";

import { usePullToRefresh } from "#/components/reader/pull-to-refresh";
import { ButtonLink } from "#/components/router-links";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { ContinueReading } from "../components/reader/continue-reading";
import { FeedLoadMore } from "../components/reader/feed-load-more";
import {
  Masthead,
  ReaderContent,
  SectionHead,
} from "../components/reader/primitives";
import { ReaderQueueRows } from "../components/reader/reader-queue-rows";

export const Route = createFileRoute("/_layout/history")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      user.getSessionQueryOptions,
    );
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: buildAuthRedirectPath("/history") },
      });
    }
  },
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(
        readerApi.getReadingHistoryInfiniteQueryOptions(),
      ),
      // The shelf rides along so it paints with the list, but it must never be
      // what fails the page: offline (or on any server hiccup) a rejection here
      // would throw the whole route to the error component and cost the reader
      // their cached history over a six-row extra. The component treats a
      // missing result as an empty shelf.
      context.queryClient
        .ensureQueryData(readerApi.getUnfinishedReadingQueryOptions())
        .catch(() => null),
    ]);
  },
  head: () => ({
    meta: pageSocialMeta("history", getPublicUrlClient()),
  }),
  component: ReaderHistory,
});

const styles = stylex.create({
  emptyCard: {
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    boxSizing: "border-box",
    paddingInlineEnd: spacing["8"],
    paddingInlineStart: spacing["8"],
    marginTop: spacing["6"],
    maxWidth: "100%",
    paddingBottom: spacing["10"],
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
  loadingNote: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    textAlign: "center",
    marginTop: spacing["6"],
  },
});

function ReaderHistory() {
  usePullToRefresh();
  const { t } = useLingui();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(readerApi.getReadingHistoryInfiniteQueryOptions());
  // `useQuery`, not `useSuspenseQuery`: the shelf is an extra on this page, and
  // suspending (or throwing) on it would take the reading history down with it
  // when the reader is offline.
  const { data: unfinished } = useQuery(
    readerApi.getUnfinishedReadingQueryOptions(),
  );

  const history = data.pages.flatMap((page) => page.items);
  const total = data.pages[0]?.total ?? 0;
  const unfinishedItems = unfinished ?? [];
  const hasUnfinished = unfinishedItems.some((item) => item.article != null);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const queueRows = history.map((item) => ({
    id: item.readUri,
    documentUri: item.documentUri,
    article: item.article,
    timestamp: item.readAt,
    actionLabel: t`Read`,
  }));

  return (
    <ReaderContent>
      <Masthead
        kicker={t`Your profile`}
        title={t`Reading history`}
        dek={t`Articles you've opened — public records in your repo, synced across devices.`}
        metaLabel={t`Read`}
        metaValue={String(total)}
      />

      {total === 0 ? (
        <div {...stylex.props(styles.emptyCard)}>
          <Flex
            direction="column"
            gap="lg"
            align="start"
            style={styles.emptyInner}
          >
            <span {...stylex.props(styles.emptyTitle)}>
              <Trans>Nothing here yet</Trans>
            </span>
            <p {...stylex.props(styles.emptyDek)}>
              <Trans>
                Open any article while signed in and it&apos;ll show up here.
                Your history lives in your repo as{" "}
                <code {...stylex.props(styles.emptyCode)}>
                  app.standard-reader.read
                </code>{" "}
                records.
              </Trans>
            </p>
            <ButtonLink to="/" variant="secondary" size="lg">
              <Trans>Browse your feed</Trans>
            </ButtonLink>
          </Flex>
        </div>
      ) : (
        <>
          <ContinueReading items={unfinishedItems} />
          {/* Only once the shelf is above it does the list below need naming —
              on its own it is the page, and the masthead already said so. */}
          {hasUnfinished ? (
            <SectionHead title={t`Everything you've read`} size="md" />
          ) : null}
          <ReaderQueueRows
            items={queueRows}
            showSaveButton={false}
            showMarkUnreadButton
          />
          {isFetchingNextPage ? (
            <p {...stylex.props(styles.loadingNote)}>
              <Trans>Loading…</Trans>
            </p>
          ) : null}
          <FeedLoadMore
            hasMore={hasNextPage}
            isLoading={isFetchingNextPage}
            onLoadMore={loadMore}
            itemCount={history.length}
          />
        </>
      )}
    </ReaderContent>
  );
}
