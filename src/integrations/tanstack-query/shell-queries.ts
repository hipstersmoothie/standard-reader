import type { QueryClient } from "@tanstack/react-query";

import { feedApi } from "./api-feed.functions";
import { listApi } from "./api-lists.functions";

/** Sidebar + list metadata — refresh in the background, not on every child nav. */
export const SHELL_QUERY_STALE_TIME_MS = 5 * 60_000;

/** Parent layout loader — skip re-running when hopping between child routes. */
export const LAYOUT_ROUTE_STALE_TIME_MS = 5 * 60_000;

export function sidebarQueryOptions() {
  return feedApi.getSidebarQueryOptions();
}

export function listsQueryOptions() {
  return listApi.getListsQueryOptions();
}

export function savedListsQueryOptions() {
  return listApi.getSavedListsQueryOptions();
}

/**
 * Warm shell queries for AppShell. Blocks only on a cold cache (first paint);
 * otherwise prefetches in the background so child route loaders are not gated.
 */
export async function loadShellQueries(
  queryClient: QueryClient,
  signedIn: boolean,
): Promise<void> {
  const sidebar = sidebarQueryOptions();

  if (!signedIn) {
    void queryClient.prefetchQuery(sidebar);
    return;
  }

  const lists = listsQueryOptions();
  const savedLists = savedListsQueryOptions();
  const cold =
    queryClient.getQueryData(sidebar.queryKey) === undefined ||
    queryClient.getQueryData(lists.queryKey) === undefined ||
    queryClient.getQueryData(savedLists.queryKey) === undefined;

  if (cold) {
    await Promise.all([
      queryClient.ensureQueryData(sidebar),
      queryClient.ensureQueryData(lists),
      queryClient.ensureQueryData(savedLists),
    ]);
    return;
  }

  void queryClient.prefetchQuery(sidebar);
  void queryClient.prefetchQuery(lists);
  void queryClient.prefetchQuery(savedLists);
}
