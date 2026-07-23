"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  FolderPlus,
  UserRound,
  X,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import type { Selection, SortDescriptor } from "react-aria-components";
import { RouterProvider } from "react-aria-components";

import type { Formatters } from "#/lib/formatters";
import { parseInternalRoute } from "#/lib/internal-route";
import { useFormatters } from "#/lib/use-formatters";
import { useMediaQuery } from "#/lib/use-media-query";

import { Avatar } from "../../design-system/avatar";
import { Button } from "../../design-system/button";
import { Flex } from "../../design-system/flex";
import { IconButton } from "../../design-system/icon-button";
import { Menu, MenuItem } from "../../design-system/menu";
import { SearchField } from "../../design-system/search-field";
import { Select, SelectItem } from "../../design-system/select";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "../../design-system/table";
import { primaryColor, uiColor } from "../../design-system/theme/color.stylex";
import { radius } from "../../design-system/theme/radius.stylex";
import {
  gap,
  horizontalSpace,
  verticalSpace,
} from "../../design-system/theme/semantic-spacing.stylex";
import { spacing } from "../../design-system/theme/spacing.stylex";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "../../design-system/theme/typography.stylex";
import { toasts } from "../../design-system/toast";
import type {
  FollowingPublication,
  FollowingUser,
} from "../../integrations/tanstack-query/api-feed.functions";
import { listApi } from "../../integrations/tanstack-query/api-lists.functions";
import { readerApi } from "../../integrations/tanstack-query/api-reader.functions";
import type { SubscriptionPeopleStats } from "../../integrations/tanstack-query/api-subscriptions.functions";
import type { SubscriptionList } from "../../server/reader/saved-lists";
import { publicationLinkParams } from "./format";
import { UnsubscribeConfirmDialog } from "./subscriptions-unsubscribe-dialog";

/**
 * The `/subscriptions` directory: every publication and person the reader
 * follows in one sortable, multi-selectable table.
 *
 * Two row kinds share one table because they share one mental model — the
 * sidebar files people under "Subscriptions" too. They differ in what the
 * network knows about them, so the columns are the intersection plus a `Type`
 * column (sortable, which is how you group the table by kind): publications
 * carry a topic, people don't.
 *
 * Rows are a link to the subject; the checkbox is the only thing that selects,
 * so a stray click never costs the reader their selection.
 */

export type SubscriptionRowKind = "publication" | "person";

interface SubscriptionRow {
  id: string;
  kind: SubscriptionRowKind;
  name: string;
  /** `@handle` for people and publication owners; blank when unresolved. */
  handle: string | null;
  avatarUrl: string | null;
  href: string | null;
  external: boolean;
  unreadCount: number;
  lastPostAt: string | null;
  documentCount: number | null;
  followerCount: number | null;
  topic: string | null;
  /** Names of the reader's own lists this subject belongs to. */
  lists: Array<string>;
}

type ColumnId =
  | "name"
  | "kind"
  | "unread"
  | "lastPost"
  | "articles"
  | "followers"
  | "topic"
  | "lists";

/**
 * How much room each column needs before it earns a place.
 *
 * The thresholds are the table's own, not the shell's: above 60rem the sidebar
 * takes 264px, so a 1280px window leaves the content column ~936px — less than
 * a 960px window with no sidebar. Tiers are therefore tuned to what the content
 * column actually gets, not to where the nav happens to change.
 *
 * Dropped columns are never lost: every one of them stays sortable through the
 * compact sort control, and the narrow layout folds the last-post date and
 * unread count into the row itself.
 *
 * Measured minimum content widths per tier — the thresholds add the sidebar
 * (264px) and the content padding (80px) back on top:
 *
 * | tier   | columns                                  | needs   | from   |
 * | ------ | ---------------------------------------- | ------- | ------ |
 * | narrow | name (+ inline date and unread)          | ~350px  | 0      |
 * | roomy  | + unread, last post                      | ~540px  | 40rem  |
 * | medium | + type, articles, followers              | ~830px  | 75rem  |
 * | wide   | + topic, lists                           | ~1120px | 94rem  |
 */
type ColumnTier = "narrow" | "roomy" | "medium" | "wide";

const COLUMN_TIER: Record<ColumnId, ColumnTier> = {
  name: "narrow",
  unread: "roomy",
  lastPost: "roomy",
  kind: "medium",
  articles: "medium",
  followers: "medium",
  topic: "wide",
  lists: "wide",
};

const TIER_RANK: Record<ColumnTier, number> = {
  narrow: 0,
  roomy: 1,
  medium: 2,
  wide: 3,
};

/**
 * Fixed row geometry for the virtualizer.
 *
 * Every row is the same shape — an avatar beside a name/handle stack, with the
 * narrow layout adding a trailing date/unread stack — and both lines are
 * single-line-with-ellipsis, so height comes from tokened line-heights rather
 * than from content. Giving the layout exact heights rather than an estimate
 * skips react-aria's per-row `ResizeObserver` measurement entirely, which is
 * the expensive part of a fast scroll: a fling mounts a screenful of rows at a
 * time, and each measurement invalidates the layout and re-renders.
 *
 * Measured content is 53px (49px narrow); the few px of headroom is for scripts
 * with taller ascenders than Latin.
 */
const ROW_HEIGHT = 58;
const NARROW_ROW_HEIGHT = 54;
const HEADING_HEIGHT = 38;

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/**
 * The value a column sorts on, plus whether the row has one at all. Absent is
 * not "smallest": a publication that has never posted isn't the oldest, and a
 * person whose stats haven't loaded isn't zero — so `missing` is tracked
 * separately and settled before direction is applied.
 */
function sortKey(
  row: SubscriptionRow,
  column: ColumnId,
): { missing: boolean; value: number | string } {
  switch (column) {
    case "kind": {
      return { missing: false, value: row.kind === "publication" ? 0 : 1 };
    }
    case "unread": {
      return { missing: false, value: row.unreadCount };
    }
    case "lastPost": {
      const at = row.lastPostAt ? Date.parse(row.lastPostAt) : Number.NaN;
      return Number.isNaN(at)
        ? { missing: true, value: 0 }
        : { missing: false, value: at };
    }
    case "articles": {
      return row.documentCount == null
        ? { missing: true, value: 0 }
        : { missing: false, value: row.documentCount };
    }
    case "followers": {
      return row.followerCount == null
        ? { missing: true, value: 0 }
        : { missing: false, value: row.followerCount };
    }
    case "topic": {
      return row.topic
        ? { missing: false, value: row.topic }
        : { missing: true, value: "" };
    }
    case "lists": {
      const first = row.lists[0];
      return first
        ? { missing: false, value: first }
        : { missing: true, value: "" };
    }
    default: {
      return { missing: false, value: row.name };
    }
  }
}

/** Rows without a value for the sorted column always land at the bottom, in
 * both directions; everything else flips with the direction, name as tiebreak. */
function sortRows(
  rows: Array<SubscriptionRow>,
  { column, direction }: { column: ColumnId; direction: "asc" | "desc" },
): Array<SubscriptionRow> {
  const flip = direction === "asc" ? 1 : -1;
  return rows.toSorted((a, b) => {
    const ka = sortKey(a, column);
    const kb = sortKey(b, column);
    if (ka.missing !== kb.missing) return ka.missing ? 1 : -1;

    const primary =
      typeof ka.value === "number" && typeof kb.value === "number"
        ? ka.value - kb.value
        : compareStrings(String(ka.value), String(kb.value));
    if (primary !== 0) return primary * flip;
    return compareStrings(a.name, b.name) * flip;
  });
}

export function SubscriptionsTable({
  following,
  followingUsers,
  peopleStats,
  lists,
}: {
  following: Array<FollowingPublication>;
  followingUsers: Array<FollowingUser>;
  peopleStats: SubscriptionPeopleStats | undefined;
  lists: Array<SubscriptionList>;
}) {
  const { t } = useLingui();
  const fmt = useFormatters();
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Phrased as max-width so every probe is `false` on the server and during
  // hydration: the first frame renders the full column set, and the CSS mirrors
  // below (`styles.tier*`) hide whatever doesn't fit. Server and client agree at
  // every width, so nothing reflows once JS takes over.
  const belowWide = useMediaQuery("(max-width: 93.999rem)");
  const belowMedium = useMediaQuery("(max-width: 74.999rem)");
  const belowRoomy = useMediaQuery("(max-width: 39.999rem)");
  const tier: ColumnTier = belowRoomy
    ? "narrow"
    : belowMedium
      ? "roomy"
      : belowWide
        ? "medium"
        : "wide";

  const [selection, setSelection] = useState<Selection>(new Set());
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortDescriptor>({
    column: "lastPost",
    direction: "descending",
  });
  const sortColumn = (sort.column as ColumnId | undefined) ?? "lastPost";

  const listsBySubject = useMemo(() => {
    const map = new Map<string, Array<string>>();
    for (const list of lists) {
      for (const member of [...list.publications, ...list.users]) {
        const existing = map.get(member);
        if (existing) {
          existing.push(list.name);
        } else {
          map.set(member, [list.name]);
        }
      }
    }
    return map;
  }, [lists]);

  const rows = useMemo<Array<SubscriptionRow>>(() => {
    const pubRows = following.map((pub): SubscriptionRow => {
      const params = publicationLinkParams(pub.uri);
      const internal = params ? null : parseInternalRoute(pub.url ?? "");
      const href = params
        ? router.buildLocation({ to: "/p/$did/$rkey", params }).href
        : internal
          ? router.buildLocation(
              internal.params
                ? { to: internal.to, params: internal.params }
                : { to: internal.to },
            ).href
          : (pub.url ?? null);
      return {
        id: pub.uri,
        kind: "publication",
        name: pub.name,
        handle: pub.ownerHandle ?? null,
        avatarUrl: pub.iconUrl ?? pub.ownerAvatarUrl ?? null,
        href,
        external: !params && !internal && Boolean(pub.url),
        unreadCount: pub.unreadCount ?? 0,
        lastPostAt: pub.lastDocumentAt,
        documentCount: pub.documentCount,
        followerCount: pub.subscriberCount,
        topic: pub.topic,
        lists: listsBySubject.get(pub.uri) ?? [],
      };
    });

    const personRows = followingUsers.map((person): SubscriptionRow => {
      const stats = peopleStats?.[person.did];
      return {
        id: person.did,
        kind: "person",
        name: person.displayName || (person.handle ?? person.did),
        handle: person.handle ?? null,
        avatarUrl: person.avatarUrl ?? null,
        href: router.buildLocation({
          to: "/u/$did",
          params: { did: person.did },
        }).href,
        external: false,
        unreadCount: person.unreadCount ?? 0,
        // `null` (not 0) until the stats query resolves, so the cell renders a
        // neutral placeholder instead of asserting "0 articles".
        lastPostAt: stats?.lastDocumentAt ?? null,
        documentCount: stats?.documentCount ?? null,
        followerCount: stats?.followerCount ?? null,
        topic: null,
        lists: listsBySubject.get(person.did) ?? [],
      };
    });

    return [...pubRows, ...personRows];
  }, [following, followingUsers, peopleStats, listsBySubject, router]);

  const visibleRows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const matched = needle
      ? rows.filter(
          (row) =>
            row.name.toLowerCase().includes(needle) ||
            (row.handle?.toLowerCase().includes(needle) ?? false) ||
            (row.topic?.toLowerCase().includes(needle) ?? false),
        )
      : rows;
    return sortRows(matched, {
      column: sortColumn,
      direction: sort.direction === "ascending" ? "asc" : "desc",
    });
  }, [rows, filter, sortColumn, sort.direction]);

  const selectedIds = useMemo(() => {
    if (selection === "all") return visibleRows.map((row) => row.id);
    return visibleRows
      .filter((row) => selection.has(row.id))
      .map((row) => row.id);
  }, [selection, visibleRows]);

  const selected = useMemo(() => {
    const ids = new Set(selectedIds);
    const chosen = rows.filter((row) => ids.has(row.id));
    return {
      count: chosen.length,
      publicationUris: chosen
        .filter((row) => row.kind === "publication")
        .map((row) => row.id),
      userDids: chosen
        .filter((row) => row.kind === "person")
        .map((row) => row.id),
    };
  }, [rows, selectedIds]);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  const refreshSubscriptions = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["feed"] });
    void queryClient.invalidateQueries({ queryKey: ["discover"] });
    void queryClient.invalidateQueries({ queryKey: ["reader", "lists"] });
    void queryClient.invalidateQueries({
      queryKey: ["reader", "subscriptionPeopleStats"],
    });
  }, [queryClient]);

  const addToListMutation = useMutation(listApi.addToListMutationOptions());
  const unfollowMutation = useMutation(
    readerApi.unfollowSubscriptionsMutationOptions(),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onAddToList = (rkey: string, listName: string) => {
    addToListMutation.mutate(
      {
        rkey,
        publications: selected.publicationUris,
        users: selected.userDids,
      },
      {
        onSuccess: (result) => {
          clearSelection();
          refreshSubscriptions();
          toasts.add(
            {
              variant: "success",
              title: result.added === 0 ? t`Already in ${listName}` : t`Added`,
              description:
                result.added === 0
                  ? t`Everything selected was already in that list.`
                  : t`${result.added} added to ${listName}.`,
            },
            { timeout: 3000 },
          );
        },
        onError: (error) => {
          toasts.add({
            variant: "critical",
            title: t`Could not add to list`,
            description:
              error instanceof Error
                ? error.message
                : t`Something went wrong. Please try again.`,
          });
        },
      },
    );
  };

  const onUnfollow = () => {
    unfollowMutation.mutate(
      {
        publicationUris: selected.publicationUris,
        userDids: selected.userDids,
      },
      {
        onSuccess: (result) => {
          setConfirmOpen(false);
          clearSelection();
          refreshSubscriptions();
          const removed = result.publicationsRemoved + result.peopleRemoved;
          if (result.failed.length > 0) {
            toasts.add({
              variant: "warning",
              title: t`Partly removed`,
              description: t`${removed} removed, ${result.failed.length} could not be. Try the rest again.`,
            });
            return;
          }
          toasts.add(
            {
              variant: "success",
              title: t`Removed`,
              description: t`${removed} no longer in your subscriptions.`,
            },
            { timeout: 3000 },
          );
        },
        onError: (error) => {
          toasts.add({
            variant: "critical",
            title: t`Could not unsubscribe`,
            description:
              error instanceof Error
                ? error.message
                : t`Something went wrong. Please try again.`,
          });
        },
      },
    );
  };

  const routerNavigate = useCallback(
    (to: string, options?: { replace?: boolean }) => {
      void navigate({ to, replace: options?.replace });
    },
    [navigate],
  );

  const busy = addToListMutation.isPending;

  const columns: Array<{ id: ColumnId; label: string; width?: number }> = [
    { id: "name", label: t`Name` },
    { id: "kind", label: t`Type`, width: 124 },
    { id: "unread", label: t`Unread`, width: 92 },
    { id: "lastPost", label: t`Last post`, width: 132 },
    { id: "articles", label: t`Articles`, width: 92 },
    { id: "followers", label: t`Followers`, width: 108 },
    { id: "topic", label: t`Topic`, width: 132 },
    { id: "lists", label: t`Lists`, width: 168 },
  ];
  const shownColumns = columns.filter(
    (column) => TIER_RANK[COLUMN_TIER[column.id]] <= TIER_RANK[tier],
  );

  return (
    <div data-unclipped-sticky {...stylex.props(styles.root)}>
      {/* One row, always. The selection cluster takes the place of the result
          count rather than adding a bar of its own — a second row appearing on
          first select would push the whole table down under the reader's
          cursor, mid-selection. */}
      <Flex align="center" gap="md" wrap style={styles.toolbar}>
        <SearchField
          size="lg"
          aria-label={t`Filter subscriptions`}
          placeholder={t`Filter by name, handle, or topic`}
          value={filter}
          onChange={setFilter}
          style={styles.filterField}
        />
        {/* Narrow layouts drop most column headers, so sorting by the columns
            they lose needs a control of its own. Always rendered and hidden by
            CSS above the breakpoint, so the server frame matches the client. */}
        <Flex align="center" gap="xs" style={styles.sortControl}>
          <Select
            size="lg"
            aria-label={t`Sort by`}
            selectedKey={sortColumn}
            onSelectionChange={(key) => {
              if (key == null) return;
              setSort({ column: String(key), direction: sort.direction });
            }}
            style={styles.sortSelect}
          >
            {columns.map((column) => (
              <SelectItem
                key={column.id}
                id={column.id}
                textValue={column.label}
              >
                {column.label}
              </SelectItem>
            ))}
          </Select>
          <IconButton
            size="lg"
            variant="secondary"
            label={
              sort.direction === "ascending"
                ? t`Sort descending`
                : t`Sort ascending`
            }
            onPress={() => {
              setSort({
                column: sortColumn,
                direction:
                  sort.direction === "ascending" ? "descending" : "ascending",
              });
            }}
          >
            {sort.direction === "ascending" ? (
              <ArrowUp size={16} />
            ) : (
              <ArrowDown size={16} />
            )}
          </IconButton>
        </Flex>

        {selected.count > 0 ? (
          <Flex
            align="center"
            gap="sm"
            wrap
            role="group"
            aria-label={t`Selection actions`}
            style={styles.selectionCluster}
          >
            <span {...stylex.props(styles.selectionCount)}>
              {t`${selected.count} selected`}
            </span>
            {lists.length > 0 ? (
              <Menu
                trigger={
                  <Button size="lg" variant="secondary" isDisabled={busy}>
                    <FolderPlus size={16} aria-hidden />{" "}
                    <Trans>Add to list</Trans>
                  </Button>
                }
                placement="bottom end"
                onAction={(key) => {
                  const list = lists.find((item) => item.rkey === key);
                  if (list) onAddToList(list.rkey, list.name);
                }}
              >
                {lists.map((list) => (
                  <MenuItem key={list.rkey} id={list.rkey}>
                    {list.name}
                  </MenuItem>
                ))}
              </Menu>
            ) : null}
            <UnsubscribeConfirmDialog
              isOpen={confirmOpen}
              onOpenChange={setConfirmOpen}
              publicationCount={selected.publicationUris.length}
              peopleCount={selected.userDids.length}
              isDisabled={busy}
              isPending={unfollowMutation.isPending}
              onConfirm={onUnfollow}
              size="lg"
            />
            <IconButton
              size="lg"
              variant="tertiary"
              label={t`Clear selection`}
              onPress={clearSelection}
            >
              <X size={16} />
            </IconButton>
          </Flex>
        ) : (
          <span {...stylex.props(styles.resultCount)} aria-live="polite">
            {filter.trim()
              ? t`${visibleRows.length} of ${rows.length}`
              : t`${rows.length} total`}
          </span>
        )}
      </Flex>

      {/* A header row over nothing is noise, and react-aria's select-all
          checkbox reads as half-checked when the collection is empty — so a
          filter with no matches replaces the table rather than emptying it. */}
      {visibleRows.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          gap="xl"
          style={styles.noMatches}
        >
          <p {...stylex.props(styles.noMatchesText)}>
            <Trans>Nothing matches “{filter.trim()}”.</Trans>
          </p>
          <Button variant="secondary" onPress={() => setFilter("")}>
            <Trans>Clear filter</Trans>
          </Button>
        </Flex>
      ) : (
        <div {...stylex.props(styles.tableScroll)}>
          <RouterProvider navigate={routerNavigate}>
            <Table
              aria-label={t`Subscriptions`}
              // Narrow layouts trade the roomy editorial row padding for the
              // horizontal room the columns need; `lg` alone pushes the table
              // past the viewport at 390.
              size={tier === "narrow" ? "md" : "lg"}
              // Only the rows near the viewport are rendered. react-aria
              // scrolls against the page rather than an inner scrollport, so
              // the table keeps its natural height and the reader keeps one
              // scrollbar.
              isVirtualized
              rowHeight={tier === "narrow" ? NARROW_ROW_HEIGHT : ROW_HEIGHT}
              headingHeight={HEADING_HEIGHT}
              selectionMode="multiple"
              selectedKeys={selection}
              onSelectionChange={setSelection}
              sortDescriptor={sort}
              onSortChange={setSort}
              style={styles.table}
            >
              <TableHeader variant="plain">
                {shownColumns.map((column) => (
                  <TableColumn
                    key={column.id}
                    id={column.id}
                    isRowHeader={column.id === "name"}
                    allowsSorting
                    width={column.id === "name" ? undefined : column.width}
                    minWidth={column.id === "name" ? 200 : undefined}
                    style={tierStyles[COLUMN_TIER[column.id]]}
                  >
                    {column.label}
                  </TableColumn>
                ))}
              </TableHeader>
              <TableBody>
                {visibleRows.map((row, rowIndex) => {
                  // Computed per row, not per cell — these were nine ICU
                  // lookups a row, all but one of them thrown away.
                  const labels: SubscriptionCellLabels = {
                    type:
                      row.kind === "publication" ? t`Publication` : t`Person`,
                    unread: t`${row.unreadCount} unread`,
                    neverPosted: t`No posts yet`,
                  };
                  return (
                    <TableRow
                      key={row.id}
                      id={row.id}
                      href={row.href ?? undefined}
                      target={row.external ? "_blank" : undefined}
                      rel={row.external ? "noreferrer" : undefined}
                      style={styles.row}
                      // The container's own border closes the table off; the last
                      // row's would double it. Marked here rather than matched
                      // with `:last-child`, which can't see the real last row
                      // once rows are windowed.
                      data-last-row={
                        rowIndex === visibleRows.length - 1 || undefined
                      }
                    >
                      {shownColumns.map((column) => (
                        <TableCell
                          key={column.id}
                          style={tierStyles[COLUMN_TIER[column.id]]}
                        >
                          <SubscriptionCell
                            row={row}
                            column={column.id}
                            fmt={fmt}
                            labels={labels}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </RouterProvider>
        </div>
      )}
    </div>
  );
}

interface SubscriptionCellLabels {
  type: string;
  unread: string;
  neverPosted: string;
}

/**
 * Memoized: the virtualizer mounts a screenful of rows per scroll burst, and
 * `row` / `labels` are stable per row, so unchanged cells re-render for free.
 */
const SubscriptionCell = memo(function SubscriptionCellInner({
  row,
  column,
  fmt,
  labels,
}: {
  row: SubscriptionRow;
  column: ColumnId;
  fmt: Formatters;
  labels: SubscriptionCellLabels;
}) {
  const { relativeTime, longDate: absoluteDate, number: formatNumber } = fmt;
  const {
    type: typeLabel,
    unread: unreadLabel,
    neverPosted: neverPostedLabel,
  } = labels;
  switch (column) {
    case "name": {
      return (
        <Flex align="center" gap="lg" style={styles.nameCell}>
          <Avatar
            size="md"
            src={row.avatarUrl ?? undefined}
            fallback={initialsOf(row.name)}
            alt=""
            style={row.kind === "publication" ? styles.pubAvatar : undefined}
          />
          <span {...stylex.props(styles.nameStack)}>
            <span {...stylex.props(styles.name)}>{row.name}</span>
            {row.handle ? (
              <span {...stylex.props(styles.handle)}>@{row.handle}</span>
            ) : null}
          </span>
          {/* The narrow layout has no Last post / Unread columns, so both ride
              along at the trailing edge — keeping the leading stack to the two
              lines that identify the subject. CSS-hidden (not conditionally
              rendered) above the breakpoint so the server frame matches the
              client. */}
          <span {...stylex.props(styles.inlineTrailing)}>
            {row.unreadCount > 0 ? (
              <span
                {...stylex.props(styles.inlineUnread)}
                aria-label={unreadLabel}
              >
                {formatNumber(row.unreadCount)}
              </span>
            ) : null}
            <span {...stylex.props(styles.inlineMeta)}>
              {row.lastPostAt ? (
                <time dateTime={row.lastPostAt}>
                  {relativeTime(row.lastPostAt)}
                </time>
              ) : (
                neverPostedLabel
              )}
            </span>
          </span>
        </Flex>
      );
    }
    case "kind": {
      return (
        <Flex align="center" gap="sm" style={styles.kindCell}>
          {row.kind === "publication" ? (
            <BookOpen size={14} aria-hidden />
          ) : (
            <UserRound size={14} aria-hidden />
          )}
          <span>{typeLabel}</span>
        </Flex>
      );
    }
    case "unread": {
      if (row.unreadCount <= 0) {
        return <span {...stylex.props(styles.empty)}>—</span>;
      }
      return (
        <span {...stylex.props(styles.unread)} aria-label={unreadLabel}>
          {formatNumber(row.unreadCount)}
        </span>
      );
    }
    case "lastPost": {
      if (!row.lastPostAt) {
        return <span {...stylex.props(styles.empty)}>—</span>;
      }
      return (
        <time
          dateTime={row.lastPostAt}
          title={absoluteDate(row.lastPostAt)}
          {...stylex.props(styles.numeric)}
        >
          {relativeTime(row.lastPostAt)}
        </time>
      );
    }
    case "articles":
    case "followers": {
      const value =
        column === "articles" ? row.documentCount : row.followerCount;
      if (value == null) {
        return <span {...stylex.props(styles.empty)}>—</span>;
      }
      return (
        <span {...stylex.props(styles.numeric)}>{formatNumber(value)}</span>
      );
    }
    case "topic": {
      if (!row.topic) {
        return <span {...stylex.props(styles.empty)}>—</span>;
      }
      return <span {...stylex.props(styles.topic)}>{row.topic}</span>;
    }
    case "lists": {
      if (row.lists.length === 0) {
        return <span {...stylex.props(styles.empty)}>—</span>;
      }
      return (
        <span {...stylex.props(styles.lists)}>{row.lists.join(" · ")}</span>
      );
    }
    default: {
      return null;
    }
  }
});

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => [...part][0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * CSS mirror of the JS column tiers. The server renders every column (the
 * media-query hooks all report `false` before hydration); these hide the ones
 * that don't fit, so the pre-hydration frame already looks like the hydrated
 * one and nothing reflows. Keep the breakpoints in step with the `belowWide` /
 * `belowMedium` / `belowRoomy` probes.
 */
const tierStyles = stylex.create({
  narrow: {},
  roomy: {
    display: {
      default: null,
      "@media (max-width: 39.999rem)": "none",
    },
  },
  medium: {
    display: {
      default: null,
      "@media (max-width: 74.999rem)": "none",
    },
  },
  wide: {
    display: {
      default: null,
      "@media (max-width: 93.999rem)": "none",
    },
  },
});

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    marginTop: spacing["6"],
    minWidth: 0,
    width: "100%",
  },
  toolbar: {
    paddingBottom: verticalSpace["3xl"],
  },
  filterField: {
    flexBasis: "16rem",
    flexGrow: 1,
    maxWidth: "22rem",
    minWidth: 0,
  },
  /** Narrow-only; the header row is the sort control everywhere else. */
  sortControl: {
    display: {
      default: "none",
      "@media (max-width: 39.999rem)": "flex",
    },
    flexShrink: 0,
  },
  sortSelect: {
    minWidth: "9rem",
  },
  resultCount: {
    color: uiColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    marginInlineStart: "auto",
  },
  /** Sits where the result count would be, so selecting never adds a row. */
  selectionCluster: {
    marginInlineStart: "auto",
  },
  selectionCount: {
    marginRight: spacing["2"],
    color: uiColor.text2,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    paddingInlineEnd: horizontalSpace.sm,
  },
  tableScroll: {
    // Wide content scrolls inside its own port; the page never scrolls sideways.
    // The border and radius live here rather than on the table so the corners
    // clip the rows — `overflow-x: auto` is what makes the radius clip at all.
    borderColor: uiColor.border1,
    borderRadius: radius.md,
    borderStyle: "solid",
    borderWidth: 1,
    cornerShape: "squircle",
    maxWidth: "100%",
    overflowX: "auto",
  },
  table: {
    // Virtualized, so react-aria's `TableLayout` resolves the `width` /
    // `minWidth` props on each column into real widths — the flexible Name
    // column takes whatever the fixed ones leave.
    minWidth: "100%",
  },
  /** Restates the design-system row backgrounds (StyleX merges per property,
   * so a partial override would drop the base and hover fills) and adds the
   * selected wash — selection has to be legible from the row, not just its
   * checkbox, when a dozen rows are picked. */
  row: {
    backgroundColor: {
      default: uiColor.bg,
      ":is([data-hovered])": uiColor.bgSubtle,
      ":is([data-selected])": primaryColor.component1,
    },
  },
  nameCell: {
    // Span the column, so the narrow layout's trailing date/unread stack can
    // sit flush against the cell's right edge rather than trailing the name.
    flexGrow: 1,
    minWidth: 0,
    width: "100%",
  },
  pubAvatar: {
    // Publications are objects (square marks); people are faces (circles).
    borderRadius: radius.sm,
  },
  nameStack: {
    display: "flex",
    flexDirection: "column",
    gap: gap.xxs,
    minWidth: 0,
  },
  name: {
    color: uiColor.text2,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.sm,
    // The column's own width is the cap now — the virtualizer's TableLayout
    // sizes columns — so this just gives the ellipsis something to clip
    // against instead of truncating short of the space available.
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  handle: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  /** Narrow-only trailing stack: unread pill over the last-post date. */
  inlineTrailing: {
    alignItems: "end",
    display: {
      default: "none",
      "@media (max-width: 39.999rem)": "flex",
    },
    flexDirection: "column",
    flexShrink: 0,
    gap: gap.xxs,
    marginInlineStart: "auto",
    paddingInlineStart: horizontalSpace.md,
  },
  inlineMeta: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    lineHeight: lineHeight.sm,
    whiteSpace: "nowrap",
  },
  inlineUnread: {
    backgroundColor: primaryColor.component1,
    borderRadius: radius.full,
    color: primaryColor.text1,
    flexShrink: 0,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    paddingBottom: verticalSpace.xxs,
    paddingInlineEnd: horizontalSpace.md,
    paddingInlineStart: horizontalSpace.md,
    paddingTop: verticalSpace.xxs,
  },
  kindCell: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  unread: {
    // `text1` is the accent *text* step (#815e46) — `text2` is near-black ink
    // and would read as an ordinary number rather than an unread marker.
    color: primaryColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  numeric: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    whiteSpace: "nowrap",
  },
  topic: {
    color: uiColor.text1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
  lists: {
    color: uiColor.text1,
    // Block, not inline: an inline span has no width to clip against, so the
    // ellipsis never appears and long list names just get cut off.
    display: "block",
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  empty: {
    color: uiColor.text1,
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
  },
  noMatches: {
    borderTopColor: uiColor.border1,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    paddingBottom: verticalSpace["11xl"],
    paddingTop: verticalSpace["11xl"],
  },
  noMatchesText: {
    color: uiColor.text1,
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    lineHeight: lineHeight.sm,
    maxWidth: "40ch",
    overflowWrap: "anywhere",
    textAlign: "center",
  },
});
