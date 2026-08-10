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

let shellDataKeys: Array<ReadonlyArray<unknown>> | null = null;

/** The queries the shell's own chrome renders from, built once on first ask. */
function getShellDataKeys(): Array<ReadonlyArray<unknown>> {
  shellDataKeys ??= [
    sidebarQueryOptions().queryKey,
    listsQueryOptions().queryKey,
    savedListsQueryOptions().queryKey,
    sidebarPrefQueryOptions().queryKey,
  ];
  return shellDataKeys;
}

/**
 * Is this query the app's, rather than the page's?
 *
 * The shell mounts the same handful of queries on every route — who you are
 * signed in as, every saved preference, the sidebar and its lists — and they
 * are chrome, not content. A refresh aimed at a page has to leave them alone:
 * pulling down on a feed should fetch that feed, not re-read the session and
 * every setting behind it.
 *
 * Preferences are recognised by their key rather than listed: they all sit at
 * the root of the cache as `<name>Preference` (see `api-user.functions.ts`), so
 * a new one is covered the day it is added.
 */
export function isShellQuery(queryKey: ReadonlyArray<unknown>): boolean {
  const [head] = queryKey;
  if (typeof head !== "string") return false;
  // The session and the identity bits the root loader bootstraps alongside it.
  if (head === "session" || head === "localeHint" || head === "savedHandles") {
    return true;
  }
  if (head.endsWith("Preference")) return true;
  return getShellDataKeys().some(
    (key) =>
      key.length === queryKey.length &&
      key.every((segment, index) => segment === queryKey[index]),
  );
}

/** Seed sidebar + list queries from a single snapshot when bootstrap did not. */
async function ensureShellSnapshot(queryClient: QueryClient): Promise<void> {
  const sidebarOpts = sidebarQueryOptions();
  const sidebarPrefOpts = sidebarPrefQueryOptions();
  // Both must already be seeded (e.g. by the root loader's bootstrap) for
  // this to be a no-op — a partial seed (sidebar without sidebarPref) must
  // still fall through to the snapshot fetch, or sidebarPref's collapsed /
  // hiddenNav / subscriptionSort would silently read as defaults on first
  // paint and visibly snap once a later client fetch resolves.
  if (
    queryClient.getQueryData(sidebarOpts.queryKey) !== undefined &&
    queryClient.getQueryData(sidebarPrefOpts.queryKey) !== undefined
  ) {
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
  queryClient.setQueryData(sidebarPrefOpts.queryKey, snapshot.sidebarPref);
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
