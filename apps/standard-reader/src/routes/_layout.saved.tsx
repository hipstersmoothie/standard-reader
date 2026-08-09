"use client";

import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Flex } from "@standard-reader/design-system/flex";
import { IconButton } from "@standard-reader/design-system/icon-button";
import {
  Menu,
  MenuItem,
  MenuSection,
  MenuSectionHeader,
  MenuSeparator,
} from "@standard-reader/design-system/menu";
import { ProgressCircle } from "@standard-reader/design-system/progress-circle";
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
import {
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUpNarrowWide,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Selection } from "react-aria-components";
import { z } from "zod";

import { ButtonLink } from "#/components/router-links";
import type {
  SavedSort,
  SavedSortDirection,
} from "#/integrations/tanstack-query/api-reader.functions";
import {
  defaultSavedSortDirection,
  readerApi,
  SAVED_SORT_DIRECTIONS,
  SAVED_SORT_VALUES,
} from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { pageSocialMeta } from "#/lib/site-metadata";
import { useDelayedLoading } from "#/lib/use-delayed-loading";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { FeedLoadMore } from "../components/reader/feed-load-more";
import { Masthead, ReaderContent } from "../components/reader/primitives";
import { ReaderQueueRows } from "../components/reader/reader-queue-rows";

const savedSearchSchema = z.object({
  sort: z.enum(SAVED_SORT_VALUES).default("added"),
  /** Left out of the URL until the reader flips a field off its natural
   * direction, so a chosen direction carries across a change of field but an
   * untouched one still follows the field (dates newest-first, names A–Z). */
  dir: z.enum(SAVED_SORT_DIRECTIONS).optional(),
});

type SavedSearch = z.infer<typeof savedSearchSchema>;

const SAVED_SORT_OPTIONS = [
  { id: "added", label: msg`Date saved` },
  { id: "published", label: msg`Published date` },
  { id: "publication", label: msg`Publication` },
  { id: "title", label: msg`Title` },
] as const;

/** What a direction is called depends on what the field ranks — "newest first"
 * for a date, "A–Z" for a name. */
const SAVED_SORT_RANKS: Record<SavedSort, "date" | "text"> = {
  added: "date",
  published: "date",
  publication: "text",
  title: "text",
};

const SAVED_DIRECTION_LABELS = {
  date: { asc: msg`Oldest first`, desc: msg`Newest first` },
  text: { asc: msg`A–Z`, desc: msg`Z–A` },
} as const;

/** Everything the compact menu offers, for freezing it while a reorder runs. */
const SAVED_MENU_KEYS: Array<string> = [
  ...SAVED_SORT_VALUES,
  ...SAVED_SORT_DIRECTIONS,
];

/** Matches the tab-skeleton grace period on `/tag` and `/topics`: a reorder
 * that lands inside it never flashes a loading state at all. */
const ORDER_PENDING_DELAY_MS = 150;

export const Route = createFileRoute("/_layout/saved")({
  validateSearch: savedSearchSchema,
  loaderDeps: ({ search }) => ({ sort: search.sort, dir: search.dir }),
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
      readerApi.getSavedInfiniteQueryOptions({
        sort: deps.sort,
        dir: deps.dir,
      }),
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
  // Two controls occupy the masthead's action slot — a compact icon menu and
  // the full select-plus-direction pair — swapped by media query rather than a
  // JS viewport check, so SSR emits both and neither can hydrate to the wrong
  // one (mirrors `/tag`'s article sort). The swap is at `md` to match where the
  // masthead drops its meta figure: below that the trailing edge is tight, so
  // the pair collapses into the single icon menu, which carries the order as a
  // second section rather than a second button — two arrow glyphs side by side
  // read as one repeated idea, not as field and direction.
  sortSlotCompact: {
    display: { default: "flex", [breakpoints.md]: "none" },
  },
  sortSlotFull: {
    display: { default: "none", [breakpoints.md]: "flex" },
  },
  sortSelect: {
    minWidth: spacing["40"],
  },
});

function ReaderSaved() {
  const { t, i18n } = useLingui();
  const { sort, dir } = Route.useSearch();
  const direction = dir ?? defaultSavedSortDirection(sort);
  const navigate = useNavigate({ from: Route.fullPath });
  /**
   * What the reader just asked for, until the router commits it. The route
   * loader resolves before the search params change, so the old rows stay on
   * screen with nothing to say a new order is on the way — this drives the
   * controls to the new choice immediately and marks the wait.
   *
   * Scoped to this page's own navigations rather than the router's global
   * `isLoading`, which would also fire when the reader clicks through to an
   * article and spin a sort control on the page they are leaving.
   */
  const [requested, setRequested] = useState<{
    sort: SavedSort;
    dir: SavedSortDirection;
  } | null>(null);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(
      readerApi.getSavedInfiniteQueryOptions({ sort, dir: direction }),
    );

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

  // Committing the requested order is what ends the wait: the loader has
  // already resolved by the time the router hands back the new search params.
  useEffect(() => {
    if (requested?.sort === sort && requested.dir === direction) {
      setRequested(null);
    }
  }, [direction, requested, sort]);

  const shownSort = requested?.sort ?? sort;
  const shownDirection = requested?.dir ?? direction;
  const changingOrder = useDelayedLoading(
    requested !== null,
    ORDER_PENDING_DELAY_MS,
  );

  const onSortChange = (key: React.Key | null) => {
    if (key == null) return;
    const next = String(key) as SavedSort;
    setRequested({ sort: next, dir: direction });
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

  const setDirection = (next: SavedSortDirection) => {
    setRequested({ sort, dir: next });
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev: SavedSearch) => ({ ...prev, dir: next }),
    });
  };

  const onDirectionSelection = (keys: Selection) => {
    if (keys === "all") return;
    const next = [...keys][0];
    if (next === "asc" || next === "desc") setDirection(next);
  };

  const directionLabels = SAVED_DIRECTION_LABELS[SAVED_SORT_RANKS[shownSort]];
  /** The button names what it will do, and shows what is true now. */
  const flipLabel = i18n._(
    shownDirection === "asc" ? directionLabels.desc : directionLabels.asc,
  );

  const sortControl =
    total === 0 ? undefined : (
      <Flex direction="row" gap="sm" align="center">
        {/* Leading the row, so it grows leftward off the masthead's trailing
            edge and the controls themselves never shift. */}
        {changingOrder ? (
          <ProgressCircle
            isIndeterminate
            size="sm"
            aria-label={t`Reordering saved articles`}
          />
        ) : null}

        <div {...stylex.props(styles.sortSlotCompact)}>
          <Menu
            placement="bottom end"
            // The trigger stays live — it only opens the sheet. What's frozen
            // is the choices inside it, which is also the half the reader is
            // looking at: the menu stays open across a pick.
            disabledKeys={changingOrder ? SAVED_MENU_KEYS : undefined}
            trigger={
              <IconButton
                aria-label={t`Sort saved articles`}
                size="md"
                variant="secondary"
              >
                <ArrowUpDown size={16} />
              </IconButton>
            }
          >
            {/* Selection lives on each section (see `/feedback`'s filter menu),
                so field and order read as one sheet and the menu stays open
                between the two choices. */}
            <MenuSection
              selectionMode="single"
              disallowEmptySelection
              shouldCloseOnSelect={false}
              selectedKeys={new Set([shownSort])}
              onSelectionChange={onSortSelection}
            >
              <MenuSectionHeader>
                <Trans>Sort by</Trans>
              </MenuSectionHeader>
              {SAVED_SORT_OPTIONS.map((option) => (
                <MenuItem key={option.id} id={option.id}>
                  {i18n._(option.label)}
                </MenuItem>
              ))}
            </MenuSection>
            <MenuSeparator />
            <MenuSection
              selectionMode="single"
              disallowEmptySelection
              shouldCloseOnSelect={false}
              selectedKeys={new Set([shownDirection])}
              onSelectionChange={onDirectionSelection}
            >
              <MenuSectionHeader>
                <Trans>Order</Trans>
              </MenuSectionHeader>
              <MenuItem id="desc">{i18n._(directionLabels.desc)}</MenuItem>
              <MenuItem id="asc">{i18n._(directionLabels.asc)}</MenuItem>
            </MenuSection>
          </Menu>
        </div>

        <div {...stylex.props(styles.sortSlotFull)}>
          <Flex direction="row" gap="sm" align="center">
            <Select
              aria-label={t`Sort saved articles`}
              size="md"
              variant="secondary"
              isDisabled={changingOrder}
              selectedKey={shownSort}
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
            <IconButton
              size="md"
              variant="secondary"
              label={flipLabel}
              aria-label={flipLabel}
              isDisabled={changingOrder}
              onPress={() =>
                setDirection(shownDirection === "asc" ? "desc" : "asc")
              }
            >
              {shownDirection === "asc" ? (
                <ArrowUpNarrowWide size={16} />
              ) : (
                <ArrowDownWideNarrow size={16} />
              )}
            </IconButton>
          </Flex>
        </div>
      </Flex>
    );

  return (
    <ReaderContent>
      <Masthead
        kicker={t`Your profile`}
        title={t`Saved for later`}
        dek={t`Articles you've saved for later — in your repo, synced across devices.`}
        metaLabel={t`Saved`}
        metaValue={String(total)}
        metaAction={sortControl}
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
