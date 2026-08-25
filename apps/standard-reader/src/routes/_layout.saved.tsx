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
import { SearchField } from "@standard-reader/design-system/search-field";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { radius } from "@standard-reader/design-system/theme/radius.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "@standard-reader/design-system/theme/typography.stylex";
import * as stylex from "@stylexjs/stylex";
import { useQuery, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { ArrowUpDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Selection } from "react-aria-components";
import { z } from "zod";

import { usePullToRefresh } from "#/components/reader/pull-to-refresh";
import {
  SavedFilterChips,
  SavedFilterPopover,
} from "#/components/reader/saved-filters";
import { ButtonLink } from "#/components/router-links";
import type {
  SavedFacets,
  SavedSort,
  SavedSortDirection,
} from "#/integrations/tanstack-query/api-reader.functions";
import {
  defaultSavedSortDirection,
  hasSavedFilters,
  readerApi,
  SAVED_FILTER_MAX_VALUES,
  SAVED_SEARCH_MAX_LENGTH,
  SAVED_SORT_DIRECTIONS,
  SAVED_SORT_VALUES,
} from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import type { SavedFilterValues } from "#/lib/saved-filters";
import { pageSocialMeta } from "#/lib/site-metadata";
import { useDelayedLoading } from "#/lib/use-delayed-loading";
import { buildAuthRedirectPath } from "#/utils/auth-redirect";

import { FeedLoadMore } from "../components/reader/feed-load-more";
import { Masthead, ReaderContent } from "../components/reader/primitives";
import { ReaderQueueRows } from "../components/reader/reader-queue-rows";

/**
 * Facet values ride the URL as JSON arrays, which is what the router's default
 * search serializer emits. Read leniently rather than validated strictly: a
 * bookmarked link outlives the tags in it, and a stale or hand-mangled
 * `?tags=…` should quietly filter nothing, not throw the page into an error
 * boundary. Empty stays `undefined` so it never reaches the URL at all.
 */
const facetParam = z
  .unknown()
  .transform((value) => {
    if (!Array.isArray(value)) return;
    const values = value
      .filter((entry): entry is string => typeof entry === "string" && !!entry)
      .slice(0, SAVED_FILTER_MAX_VALUES);
    return values.length > 0 ? values : undefined;
  })
  // Outermost, so the key stays optional on the route's search type and every
  // plain `<Link to="/saved">` in the app keeps type-checking.
  .optional();

const savedSearchSchema = z.object({
  sort: z.enum(SAVED_SORT_VALUES).default("added"),
  /** Left out of the URL until the reader flips a field off its natural
   * direction, so a chosen direction carries across a change of field but an
   * untouched one still follows the field (dates newest-first, names A–Z). */
  dir: z.enum(SAVED_SORT_DIRECTIONS).optional(),
  /** Clamped rather than rejected, for the same reason as {@link facetParam}. */
  q: z
    .unknown()
    .transform((value) => {
      const text = typeof value === "string" ? value.trim() : "";
      return text ? text.slice(0, SAVED_SEARCH_MAX_LENGTH) : undefined;
    })
    .optional(),
  pubs: facetParam,
  authors: facetParam,
  tags: facetParam,
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

/** Matches `/search`. Long enough that typing a title doesn't fire a request
 * per keystroke, short enough that the list feels answerable. */
const SEARCH_DEBOUNCE_MS = 300;

export const Route = createFileRoute("/_layout/saved")({
  validateSearch: savedSearchSchema,
  loaderDeps: ({ search }) => ({
    sort: search.sort,
    dir: search.dir,
    q: search.q,
    pubs: search.pubs,
    authors: search.authors,
    tags: search.tags,
  }),
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
      readerApi.getSavedInfiniteQueryOptions(deps),
    );
    // The filter options are never above the fold — the popover has to be
    // opened before they're visible — so they're warmed, never awaited. A
    // reader arriving on a filtered link still gets chip labels from this.
    void context.queryClient.prefetchQuery(
      readerApi.getSavedFacetsQueryOptions(),
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
  // The controls sit above the list rather than in the masthead's trailing
  // slot: there are four of them now, and a search field belongs at the head of
  // the thing it searches, not tucked under a count.
  toolbar: {
    alignItems: "center",
    columnGap: gap.md,
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: gap.md,
    // Asymmetric on purpose: closer to the masthead it belongs to than to the
    // list it acts on, so the row reads as page chrome rather than as the first
    // item in the queue.
    marginBottom: spacing["8"],
    marginTop: spacing["6"],
  },
  toolbarSearch: {
    flexBasis: spacing["48"],
    flexGrow: 1,
    minWidth: 0,
  },
  // Keeps the buttons together on one line when the search field wraps to its
  // own row, so they never strand as a lone square against the left edge.
  toolbarControls: {
    columnGap: gap.md,
    display: "flex",
    flexDirection: "row",
    flexShrink: 0,
    marginInlineStart: "auto",
  },
  // Same token and weight as the rule under every row, so the list is bounded
  // by one repeating line rather than by two that nearly match.
  listRule: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
  },
  resultCount: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    marginBottom: spacing["4"],
    marginTop: spacing["4"],
  },
});

/** The filter half of the URL, in the shape the popover speaks. */
function filterValuesFromSearch(search: SavedSearch): SavedFilterValues {
  return {
    authors: search.authors ?? [],
    pubs: search.pubs ?? [],
    tags: search.tags ?? [],
  };
}

function ReaderSaved() {
  usePullToRefresh();
  const { t, i18n } = useLingui();
  const search = Route.useSearch();
  const { sort, dir } = search;
  const direction = dir ?? defaultSavedSortDirection(sort);
  const filters = useMemo(() => filterValuesFromSearch(search), [search]);
  const navigate = useNavigate({ from: Route.fullPath });

  /**
   * What the reader just asked for, until the router commits it. The route
   * loader resolves before the search params change, so the old rows stay on
   * screen with nothing to say a new list is on the way — this drives the
   * controls to the new choice immediately and marks the wait.
   *
   * Scoped to this page's own navigations rather than the router's global
   * `isLoading`, which would also fire when the reader clicks through to an
   * article and spin a control on the page they are leaving.
   */
  const [requested, setRequested] = useState<{
    sort: SavedSort;
    dir: SavedSortDirection;
  } | null>(null);
  /** Set while a filter or search change is in flight. Unlike a reorder, these
   * don't freeze their own control — ticking three boxes in a row is normal,
   * and each tick should land. */
  const [filtersPending, setFiltersPending] = useState(false);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(
      readerApi.getSavedInfiniteQueryOptions({
        sort,
        dir: direction,
        q: search.q,
        pubs: search.pubs,
        authors: search.authors,
        tags: search.tags,
      }),
    );

  const saved = data.pages.flatMap((page) => page.items);
  const total = data.pages[0]?.total ?? 0;
  const totalSaved = data.pages[0]?.totalSaved ?? 0;
  const isFiltering = hasSavedFilters(search);

  // Filter options are wanted the moment the popover opens, and never before —
  // so they're fetched on the first open, or once the page has gone quiet,
  // whichever comes first. That keeps them off the critical path without
  // making the first open feel like it's booting something.
  const routerLoading = useRouterState({ select: (state) => state.isLoading });
  const [facetsWanted, setFacetsWanted] = useState(false);
  useEffect(() => {
    if (facetsWanted || routerLoading) return;
    const idle = globalThis.requestIdleCallback?.(() => setFacetsWanted(true));
    if (idle == null) {
      // Safari has no requestIdleCallback; a timeout is close enough for a
      // prefetch whose only job is to not compete with the critical path.
      const timer = globalThis.setTimeout(() => setFacetsWanted(true), 500);
      return () => globalThis.clearTimeout(timer);
    }
    return () => globalThis.cancelIdleCallback?.(idle);
  }, [facetsWanted, routerLoading]);

  const { data: facets, isPending: facetsPending } = useQuery({
    ...readerApi.getSavedFacetsQueryOptions(),
    enabled: facetsWanted,
  });

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

  // Same for filters, keyed off the committed search rather than a snapshot —
  // several changes can be in flight at once, and the last one to land wins.
  useEffect(() => {
    setFiltersPending(false);
  }, [search.q, search.pubs, search.authors, search.tags]);

  const shownSort = requested?.sort ?? sort;
  const shownDirection = requested?.dir ?? direction;
  const changingOrder = useDelayedLoading(
    requested !== null,
    ORDER_PENDING_DELAY_MS,
  );
  const busy = useDelayedLoading(
    requested !== null || filtersPending,
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

  const applyFilters = (next: SavedFilterValues) => {
    setFiltersPending(true);
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev: SavedSearch) => ({
        ...prev,
        authors: next.authors.length > 0 ? next.authors : undefined,
        pubs: next.pubs.length > 0 ? next.pubs : undefined,
        tags: next.tags.length > 0 ? next.tags : undefined,
      }),
    });
  };

  const directionLabels = SAVED_DIRECTION_LABELS[SAVED_SORT_RANKS[shownSort]];
  /**
   * With the order living behind a menu on every viewport, the trigger is the
   * only place the current order can be read without opening something — so it
   * names the state, not just the action. Feeds the tooltip and the accessible
   * name both.
   */
  const sortLabel = t`Sort — ${i18n._(
    SAVED_SORT_OPTIONS.find((option) => option.id === shownSort)?.label ??
      SAVED_SORT_OPTIONS[0].label,
  )}, ${i18n._(
    shownDirection === "asc" ? directionLabels.asc : directionLabels.desc,
  )}`;

  return (
    <ReaderContent>
      <Masthead
        kicker={t`Your profile`}
        title={t`Saved for later`}
        dek={t`Articles you've saved for later — in your repo, synced across devices.`}
        metaLabel={t`Saved`}
        // Always the whole queue, never the filtered subset: this is the page's
        // headline figure, and a number that drops to 3 while you narrow reads
        // as articles disappearing rather than as a filter doing its job. What
        // the filters matched is said below the toolbar instead.
        metaValue={String(totalSaved)}
      />

      {totalSaved === 0 ? (
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
          <SavedToolbar
            committedQuery={search.q ?? ""}
            onQueryChange={(next) => {
              setFiltersPending(true);
              void navigate({
                replace: true,
                resetScroll: false,
                search: (prev: SavedSearch) => ({
                  ...prev,
                  q: next || undefined,
                }),
              });
            }}
            filters={filters}
            onFiltersChange={applyFilters}
            facets={facets}
            facetsPending={facetsWanted && facetsPending}
            onFilterPopoverOpen={() => setFacetsWanted(true)}
            busy={busy}
            sortControl={
              <Menu
                placement="bottom end"
                // The trigger stays live — it only opens the sheet. What's
                // frozen is the choices inside it, which is also the half the
                // reader is looking at: the menu stays open across a pick.
                disabledKeys={changingOrder ? SAVED_MENU_KEYS : undefined}
                trigger={
                  <IconButton
                    aria-label={sortLabel}
                    label={sortLabel}
                    size="lg"
                    variant="secondary"
                  >
                    <ArrowUpDown size={16} />
                  </IconButton>
                }
              >
                {/* Selection lives on each section (see `/feedback`'s filter
                    menu), so field and order read as one sheet and the menu
                    stays open between the two choices. */}
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
            }
          />

          <SavedFilterChips
            facets={facets}
            value={filters}
            onChange={applyFilters}
            onClear={() => {
              setFiltersPending(true);
              void navigate({
                replace: true,
                resetScroll: false,
                search: (prev: SavedSearch) => ({
                  ...prev,
                  authors: undefined,
                  pubs: undefined,
                  tags: undefined,
                }),
              });
            }}
          />

          {isFiltering ? (
            <p {...stylex.props(styles.resultCount)} aria-live="polite">
              {t`Showing ${total} of ${totalSaved} saved`}
            </p>
          ) : null}

          {total === 0 ? (
            <div {...stylex.props(styles.emptyCard)}>
              <Flex
                direction="column"
                gap="lg"
                align="start"
                style={styles.emptyInner}
              >
                <span {...stylex.props(styles.emptyTitle)}>
                  <Trans>No saved articles match</Trans>
                </span>
                <p {...stylex.props(styles.emptyDek)}>
                  <Trans>
                    Nothing in your queue matches the current search and
                    filters. Try removing one.
                  </Trans>
                </p>
              </Flex>
            </div>
          ) : (
            <>
              {/* Closes the list at the top the same way every row closes at
                  the bottom — without it the toolbar's controls float above an
                  unruled first row, and the list reads as starting mid-air. */}
              <div {...stylex.props(styles.listRule)}>
                <ReaderQueueRows
                  items={queueRows}
                  saveButtonPlacement="besideMedia"
                  assumeBookmarked
                  flushFirstRow={false}
                />
              </div>
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
        </>
      )}
    </ReaderContent>
  );
}

/**
 * Search, filter, and sort, in one row above the list.
 *
 * The search field owns local state and pushes to the URL on a debounce — the
 * URL is the source of truth for what's shown, but typing into it directly
 * would fire a navigation per keystroke.
 */
function SavedToolbar({
  committedQuery,
  onQueryChange,
  filters,
  onFiltersChange,
  facets,
  facetsPending,
  onFilterPopoverOpen,
  busy,
  sortControl,
}: {
  committedQuery: string;
  onQueryChange: (next: string) => void;
  filters: SavedFilterValues;
  onFiltersChange: (next: SavedFilterValues) => void;
  facets: SavedFacets | undefined;
  facetsPending: boolean;
  onFilterPopoverOpen: () => void;
  busy: boolean;
  sortControl: React.ReactNode;
}) {
  const { t } = useLingui();
  const [input, setInput] = useState(committedQuery);

  // Adopt the URL when it changes underneath the field — a back/forward, or the
  // reader clearing everything from the chip row.
  useEffect(() => {
    setInput((current) =>
      current.trim() === committedQuery.trim() ? current : committedQuery,
    );
  }, [committedQuery]);

  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed === committedQuery.trim()) return;
    const timer = globalThis.setTimeout(() => {
      onQueryChange(trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [committedQuery, input, onQueryChange]);

  return (
    <div {...stylex.props(styles.toolbar)}>
      <SearchField
        aria-label={t`Search saved articles`}
        placeholder={t`Search saved articles…`}
        size="lg"
        variant="secondary"
        style={styles.toolbarSearch}
        value={input}
        maxLength={SAVED_SEARCH_MAX_LENGTH}
        onChange={setInput}
      />
      <div {...stylex.props(styles.toolbarControls)}>
        {/* Leads the control cluster, so it grows leftward and the buttons
            themselves never shift as it comes and goes. */}
        {busy ? (
          <ProgressCircle
            isIndeterminate
            size="md"
            aria-label={t`Updating saved articles`}
          />
        ) : null}
        <SavedFilterPopover
          facets={facets}
          isPending={facetsPending}
          value={filters}
          onChange={onFiltersChange}
          onOpenChange={(open) => {
            if (open) onFilterPopoverOpen();
          }}
        />
        {sortControl}
      </div>
    </div>
  );
}
