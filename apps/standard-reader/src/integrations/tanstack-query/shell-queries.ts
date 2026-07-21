import type { QueryClient } from "@tanstack/react-query";

import { feedApi } from "./api-feed.functions";
import { listApi } from "./api-lists.functions";
import { shellApi } from "./api-shell.functions";
import { sidebarPrefApi } from "./api-sidebar-prefs.functions";

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

export function sidebarPrefQueryOptions() {
  return sidebarPrefApi.getSidebarPrefQueryOptions();
}

/** Seed sidebar + list queries from a single snapshot when bootstrap did not. */
async function ensureShellSnapshot(queryClient: QueryClient): Promise<void> {
  const sidebarOpts = sidebarQueryOptions();
  if (queryClient.getQueryData(sidebarOpts.queryKey) !== undefined) {
    return;
  }

  const snapshot = await shellApi.getShellSnapshot();
  if (!snapshot) {
    return;
  }

  queryClient.setQueryData(sidebarOpts.queryKey, snapshot.sidebar);
  queryClient.setQueryData(listsQueryOptions().queryKey, snapshot.lists);
  queryClient.setQueryData(
    savedListsQueryOptions().queryKey,
    snapshot.savedLists,
  );
  queryClient.setQueryData(
    sidebarPrefQueryOptions().queryKey,
    snapshot.sidebarPref,
  );
}

/**
 * Warm shell queries for AppShell. Guests prefetch sidebar in the background.
 * Signed-in readers block on sidebar data (seeded by bootstrap or one snapshot
 * round trip) so the nav renders on first paint without skeleton flicker.
 */
export async function loadShellQueries(
  queryClient: QueryClient,
  signedIn: boolean,
): Promise<void> {
  if (!signedIn) {
    void queryClient.prefetchQuery(sidebarQueryOptions());
    return;
  }

  await ensureShellSnapshot(queryClient);
  await queryClient.ensureQueryData(sidebarQueryOptions());
}
