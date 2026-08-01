"use client";

import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import { Menu, MenuItem } from "@standard-reader/design-system/menu";
import { Select, SelectItem } from "@standard-reader/design-system/select";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { breakpoints } from "@standard-reader/design-system/theme/media-queries.stylex";
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
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowDownWideNarrow } from "lucide-react";
import { useCallback } from "react";
import type { Selection } from "react-aria-components";
import { z } from "zod";

import { ButtonLink } from "#/components/router-links";
import type { SavedSort } from "#/integrations/tanstack-query/api-reader.functions";
import {
  readerApi,
  SAVED_SORT_VALUES,
} from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { FeedLoadMore } from "../components/reader/feed-load-more";
import { Masthead, ReaderContent } from "../components/reader/primitives";
import { ReaderQueueRows } from "../components/reader/reader-queue-rows";

const savedSearchSchema = z.object({
  sort: z.enum(SAVED_SORT_VALUES).default("added"),
});

type SavedSearch = z.infer<typeof savedSearchSchema>;

const SAVED_SORT_OPTIONS = [
  { id: "added", label: msg`Date saved` },
  { id: "published", label: msg`Published date` },
  { id: "publication", label: msg`Publication` },
  { id: "title", label: msg`Title` },
] as const;

export const Route = createFileRoute("/_layout/saved")({
  validateSearch: savedSearchSchema,
  loaderDeps: ({ search }) => ({ sort: search.sort }),
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
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureInfiniteQueryData(
      readerApi.getSavedInfiniteQueryOptions({ sort: deps.sort }),
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
  sortRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginBottom: spacing["4"],
    width: "100%",
  },
  // Two controls occupy this slot — a compact icon menu and the full select —
  // swapped by media query rather than a JS viewport check, so SSR emits both
  // and neither can hydrate to the wrong one (mirrors `/tag`'s article sort).
  sortRowCompact: {
    display: { default: "flex", [breakpoints.sm]: "none" },
  },
  sortRowFull: {
    display: { default: "none", [breakpoints.sm]: "flex" },
  },
  sortSelect: {
    minWidth: spacing["40"],
  },
});

function ReaderSaved() {
  const { t, i18n } = useLingui();
  const { sort } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(readerApi.getSavedInfiniteQueryOptions({ sort }));

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

  const onSortChange = (key: React.Key | null) => {
    if (key == null) return;
    const next = String(key) as SavedSort;
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev: SavedSearch) => ({ ...prev, sort: next }),
    });
  };

  /** Menu hands back a `Selection`; the select hands back a single key. */
  const onSortSelection = (keys: Selection) => {
    if (keys === "all") return;
    onSortChange([...keys][0] ?? null);
  };

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
          <div {...stylex.props(styles.sortRow)}>
            <div {...stylex.props(styles.sortRowCompact)}>
              <Menu
                placement="bottom end"
                selectionMode="single"
                selectedKeys={new Set([sort])}
                onSelectionChange={onSortSelection}
                trigger={
                  <IconButton
                    aria-label={t`Sort saved articles`}
                    size="md"
                    variant="secondary"
                  >
                    <ArrowDownWideNarrow size={16} />
                  </IconButton>
                }
              >
                {SAVED_SORT_OPTIONS.map((option) => (
                  <MenuItem key={option.id} id={option.id}>
                    {i18n._(option.label)}
                  </MenuItem>
                ))}
              </Menu>
            </div>

            <div {...stylex.props(styles.sortRowFull)}>
              <Select
                aria-label={t`Sort saved articles`}
                size="md"
                variant="secondary"
                prefix={<ArrowDownWideNarrow size={14} aria-hidden />}
                selectedKey={sort}
                style={styles.sortSelect}
                onSelectionChange={onSortChange}
              >
                {SAVED_SORT_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.id}
                    id={option.id}
                    textValue={i18n._(option.label)}
                  >
                    {i18n._(option.label)}
                  </SelectItem>
                ))}
              </Select>
            </div>
          </div>

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
