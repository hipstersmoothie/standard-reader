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
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback } from "react";

import { ButtonLink } from "#/components/router-links";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { FeedLoadMore } from "../components/reader/feed-load-more";
import { Masthead, ReaderContent } from "../components/reader/primitives";
import { ReaderQueueRows } from "../components/reader/reader-queue-rows";

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

function ReaderSaved() {
  const { t } = useLingui();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(readerApi.getSavedInfiniteQueryOptions());

  const saved = data.pages.flatMap((page) => page.items);
  const total = data.pages[0]?.total ?? 0;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const queueRows = saved.map((item) => ({
    id: item.bookmarkUri,
    documentUri: item.documentUri,
    article: item.article,
    timestamp: item.savedAt,
    actionLabel: t`Saved`,
  }));

  return (
    <ReaderContent>
      <Masthead
        kicker={t`Your profile`}
        title={t`Saved for later`}
        dek={t`Articles you've saved for later — in your repo, synced across devices.`}
        metaLabel={t`Saved`}
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
              <Trans>Nothing saved yet</Trans>
            </span>
            <p {...stylex.props(styles.emptyDek)}>
              <Trans>
                Tap the bookmark on any article to save it here. Your queue
                lives in your repo as{" "}
                <code {...stylex.props(styles.emptyCode)}>
                  app.standard-reader.bookmark
                </code>{" "}
                records in your repo.
              </Trans>
            </p>
            <ButtonLink to="/" variant="secondary" size="lg">
              <Trans>Browse your feed</Trans>
            </ButtonLink>
          </Flex>
        </div>
      ) : (
        <>
          <ReaderQueueRows
            items={queueRows}
            saveButtonPlacement="besideMedia"
            assumeBookmarked
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
            itemCount={saved.length}
          />
        </>
      )}
    </ReaderContent>
  );
}
