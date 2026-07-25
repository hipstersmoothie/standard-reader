"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import type { SidebarPref } from "#/integrations/tanstack-query/api-sidebar-prefs.functions";
import { sidebarPrefApi } from "#/integrations/tanstack-query/api-sidebar-prefs.functions";
import { sidebarPrefQueryOptions } from "#/integrations/tanstack-query/shell-queries";

const EMPTY: SidebarPref = {
  listOrder: [],
  treeOrder: [],
  subscriptionSort: "default",
  collapsed: [],
  customizeNav: false,
  hiddenNav: [],
};

/** Debounce collapse writes: rapid chevron toggles coalesce into one PDS write. */
const COLLAPSE_WRITE_DELAY_MS = 600;

/** Apply a saved `listOrder` to render-ready groups. Groups absent from the
 * order keep their natural (creation) order and sort to the end, so newly
 * created lists appear at the bottom until the reader moves them. */
export function orderGroups<T extends { listUri: string }>(
  groups: Array<T>,
  order: Array<string>,
): Array<T> {
  if (order.length === 0) {
    return groups;
  }
  const rank = new Map(order.map((uri, index) => [uri, index]));
  // toSorted is stable, so equal-rank (both-unknown) items keep their original
  // relative order.
  return groups.toSorted((a, b) => {
    const ra = rank.get(a.listUri);
    const rb = rank.get(b.listUri);
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
}

/** A subscription (publication or person) as shown in the sidebar's flat rows —
 * the shape `orderSubscriptions` needs, regardless of kind. */
export interface OrderableSubscription {
  /** Publication at-uri or person DID. */
  id: string;
  name: string;
  unreadCount: number;
  /** Most recent activity signal (ISO string): a publication's last document,
   * or when the reader followed a person. Null when unknown. Only used by the
   * "recent" sort, which needs a single comparable timestamp per kind. */
  recentAt?: string | null;
}

/** Apply a sort mode to a set of subscription rows (flat ungrouped rows, or
 * one list group's own members). "default" is a no-op — callers pass rows in
 * their natural/stored order (or the reader's own manual `treeOrder`
 * arrangement, applied separately at the top level) and this leaves that
 * alone. "recent" interleaves every row by `recentAt` (most recent first);
 * "alpha" / "unread" rank by name / unread count. */
export function orderSubscriptions<T extends OrderableSubscription>(
  items: Array<T>,
  sort: SidebarPref["subscriptionSort"],
): Array<T> {
  switch (sort) {
    case "recent": {
      return items.toSorted((a, b) => {
        const aTime = a.recentAt ? Date.parse(a.recentAt) : 0;
        const bTime = b.recentAt ? Date.parse(b.recentAt) : 0;
        if (bTime !== aTime) return bTime - aTime;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
    }
    case "alpha": {
      return items.toSorted((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
    }
    case "unread": {
      return items.toSorted((a, b) => {
        if (b.unreadCount !== a.unreadCount) {
          return b.unreadCount - a.unreadCount;
        }
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
    }
    default: {
      // "default" is a no-op: items already arrive in the caller's natural
      // (stored/creation) order.
      return items;
    }
  }
}

/** Apply a saved `order` (ids of any kind) to items exposing an `id`. Ids
 * absent from `order` keep their natural order and sort to the end — the
 * same "manual with graceful fallback" pattern as {@link orderGroups}. */
export function applyManualOrder<T extends { id: string }>(
  items: Array<T>,
  order: Array<string>,
): Array<T> {
  if (order.length === 0) {
    return items;
  }
  const rank = new Map(order.map((id, index) => [id, index]));
  return items.toSorted((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
  });
}

export interface SidebarPrefController {
  /** Legacy list-group order (at-uris); fallback while `treeOrder` is empty. */
  order: Array<string>;
  /** Manual top-level tree order: list-group at-uris interleaved with
   * ungrouped subscription ids. Empty until the reader arranges the tree. */
  treeOrder: Array<string>;
  isCollapsed: (listUri: string) => boolean;
  /** Expand/collapse one group (debounced write-through). */
  setCollapsed: (listUri: string, collapsed: boolean) => void;
  /** Collapse or expand every group at once (debounced write-through). */
  setAllCollapsed: (listUris: Array<string>, collapsed: boolean) => void;
  /** How the sidebar's subscriptions are sorted. */
  subscriptionSort: SidebarPref["subscriptionSort"];
  /** Change the sort mode (immediate write-through). */
  setSubscriptionSort: (sort: SidebarPref["subscriptionSort"]) => void;
  /** Persist a new top-level tree order immediately. */
  saveTreeOrder: (order: Array<string>) => void;
  /** Whether "Customize sidebar" is enabled (gates `isNavHidden`). */
  customizeNav: boolean;
  /** Toggle the "Customize sidebar" master switch (immediate write-through). */
  setCustomizeNav: (enabled: boolean) => void;
  /** Whether a primary nav item is hidden (only meaningful when `customizeNav`). */
  isNavHidden: (navId: string) => boolean;
  /** Show/hide one primary nav item (immediate write-through). */
  setNavHidden: (navId: string, hidden: boolean) => void;
}

/**
 * Reads/writes the reader's sidebar preferences (`app.standard-reader.sidebarPref`).
 * The react-query cache is the optimistic source of truth: every change updates
 * the cache synchronously (so the UI reacts immediately) and schedules a
 * write-through to the reader's repo. Collapse toggles are debounced; reorder
 * saves flush immediately.
 */
export function useSidebarPref(signedIn: boolean): SidebarPrefController {
  const queryClient = useQueryClient();
  const options = sidebarPrefQueryOptions();
  const { data } = useQuery({ ...options, enabled: signedIn });
  const pref = data ?? EMPTY;

  const saveMutation = useMutation(
    sidebarPrefApi.putSidebarPrefMutationOptions(),
  );
  const mutate = saveMutation.mutate;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const current =
      queryClient.getQueryData<SidebarPref>(options.queryKey) ?? EMPTY;
    // Send the whole record: the server fn replaces the singleton, so any field
    // left out is written back as its default (and silently lost).
    mutate({
      listOrder: current.listOrder,
      treeOrder: current.treeOrder,
      subscriptionSort: current.subscriptionSort,
      collapsed: current.collapsed,
      customizeNav: current.customizeNav,
      hiddenNav: current.hiddenNav,
    });
  }, [queryClient, options.queryKey, mutate]);

  // Flush any pending collapse write on unmount so it isn't dropped.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(
    () => () => {
      if (timer.current) {
        flushRef.current();
      }
    },
    [],
  );

  const write = useCallback(
    (next: SidebarPref, immediate: boolean) => {
      queryClient.setQueryData(options.queryKey, next);
      if (immediate) {
        flush();
        return;
      }
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(flush, COLLAPSE_WRITE_DELAY_MS);
    },
    [queryClient, options.queryKey, flush],
  );

  const setCollapsed = useCallback(
    (listUri: string, collapsed: boolean) => {
      const current =
        queryClient.getQueryData<SidebarPref>(options.queryKey) ?? EMPTY;
      const set = new Set(current.collapsed);
      if (collapsed) {
        set.add(listUri);
      } else {
        set.delete(listUri);
      }
      write({ ...current, collapsed: [...set] }, false);
    },
    [queryClient, options.queryKey, write],
  );

  const setAllCollapsed = useCallback(
    (listUris: Array<string>, collapsed: boolean) => {
      const current =
        queryClient.getQueryData<SidebarPref>(options.queryKey) ?? EMPTY;
      // Preserve collapsed state for any groups not currently visible.
      const visible = new Set(listUris);
      const kept = current.collapsed.filter((uri) => !visible.has(uri));
      const next = collapsed ? [...kept, ...listUris] : kept;
      write({ ...current, collapsed: next }, false);
    },
    [queryClient, options.queryKey, write],
  );

  const setSubscriptionSort = useCallback(
    (sort: SidebarPref["subscriptionSort"]) => {
      const current =
        queryClient.getQueryData<SidebarPref>(options.queryKey) ?? EMPTY;
      write({ ...current, subscriptionSort: sort }, true);
    },
    [queryClient, options.queryKey, write],
  );

  const saveTreeOrder = useCallback(
    (order: Array<string>) => {
      const current =
        queryClient.getQueryData<SidebarPref>(options.queryKey) ?? EMPTY;
      write({ ...current, treeOrder: order }, true);
    },
    [queryClient, options.queryKey, write],
  );

  const setCustomizeNav = useCallback(
    (enabled: boolean) => {
      const current =
        queryClient.getQueryData<SidebarPref>(options.queryKey) ?? EMPTY;
      write({ ...current, customizeNav: enabled }, true);
    },
    [queryClient, options.queryKey, write],
  );

  const setNavHidden = useCallback(
    (navId: string, hidden: boolean) => {
      const current =
        queryClient.getQueryData<SidebarPref>(options.queryKey) ?? EMPTY;
      const set = new Set(current.hiddenNav);
      if (hidden) {
        set.add(navId);
      } else {
        set.delete(navId);
      }
      write({ ...current, hiddenNav: [...set] }, true);
    },
    [queryClient, options.queryKey, write],
  );

  const collapsedSet = new Set(pref.collapsed);
  const hiddenNavSet = new Set(pref.hiddenNav);

  return {
    order: pref.listOrder,
    treeOrder: pref.treeOrder,
    isCollapsed: (listUri: string) => collapsedSet.has(listUri),
    setCollapsed,
    setAllCollapsed,
    subscriptionSort: pref.subscriptionSort,
    setSubscriptionSort,
    saveTreeOrder,
    customizeNav: pref.customizeNav,
    setCustomizeNav,
    isNavHidden: (navId: string) => hiddenNavSet.has(navId),
    setNavHidden,
  };
}
