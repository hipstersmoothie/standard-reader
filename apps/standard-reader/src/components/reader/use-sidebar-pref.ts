"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import type { SidebarPref } from "#/integrations/tanstack-query/api-sidebar-prefs.functions";
import { sidebarPrefApi } from "#/integrations/tanstack-query/api-sidebar-prefs.functions";
import { sidebarPrefQueryOptions } from "#/integrations/tanstack-query/shell-queries";

const EMPTY: SidebarPref = { listOrder: [], collapsed: [] };

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

export interface SidebarPrefController {
  /** Saved list-group order (at-uris); empty means "default order". */
  order: Array<string>;
  isCollapsed: (listUri: string) => boolean;
  /** Expand/collapse one group (debounced write-through). */
  setCollapsed: (listUri: string, collapsed: boolean) => void;
  /** Collapse or expand every group at once (debounced write-through). */
  setAllCollapsed: (listUris: Array<string>, collapsed: boolean) => void;
  /** Persist a new group order immediately. */
  saveOrder: (order: Array<string>) => void;
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
    mutate({ listOrder: current.listOrder, collapsed: current.collapsed });
  }, [queryClient, options.queryKey, mutate]);

  // Flush any pending collapse write on unmount so it isn't dropped.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
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

  const saveOrder = useCallback(
    (order: Array<string>) => {
      const current =
        queryClient.getQueryData<SidebarPref>(options.queryKey) ?? EMPTY;
      write({ ...current, listOrder: order }, true);
    },
    [queryClient, options.queryKey, write],
  );

  const collapsedSet = new Set(pref.collapsed);

  return {
    order: pref.listOrder,
    isCollapsed: (listUri: string) => collapsedSet.has(listUri),
    setCollapsed,
    setAllCollapsed,
    saveOrder,
  };
}
