import { MutationCache, QueryClient, isServer } from "@tanstack/react-query";

import { isAtprotoScopeMissingError } from "#/lib/atproto/scope-error";

const DEFAULT_QUERY_STALE_TIME_MS = 60 * 1000;

/** React Query's own default, restated because {@link offlineAwareRetry} replaces it. */
const DEFAULT_QUERY_RETRY_COUNT = 3;

/**
 * Don't retry while the browser reports no connection.
 *
 * With {@link https://tanstack.com/query/latest/docs/framework/react/guides/network-mode `networkMode: "offlineFirst"`}
 * an offline query fetches, misses the service-worker cache, and rejects. The
 * default policy then spends three backed-off retries — ~7s of skeleton — to
 * reach the same answer, because nothing about being offline changes between
 * attempts. Fail on the first miss so the offline state renders immediately;
 * React Query refetches on `online` anyway.
 */
function offlineAwareRetry(failureCount: number): boolean {
  if (globalThis.navigator?.onLine === false) return false;
  return failureCount < DEFAULT_QUERY_RETRY_COUNT;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        /**
         * The service worker caches `/_serverFn/*` GETs (see `vite.config.ts`),
         * but the default `"online"` mode never issues the request while
         * offline — it parks the query at `fetchStatus: "paused"`. A route
         * loader's `ensureQueryData` then awaits a promise that never settles,
         * so an offline navigation hung on a skeleton forever instead of
         * failing. `"offlineFirst"` lets the request reach the service worker,
         * which answers from cache when it has the page and rejects when it
         * doesn't.
         */
        networkMode: "offlineFirst",
        retry: offlineAwareRetry,
        staleTime: DEFAULT_QUERY_STALE_TIME_MS,
      },
    },
    // Any write can fail because the reader's stored OAuth session predates a
    // scope the app now requests. Surface a single reconnect prompt globally so
    // every mutation (subscriptions, recommends, lists, collections, labeler
    // subscriptions, bookmarks) gets the same recovery path.
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isServer) return;
        if (!isAtprotoScopeMissingError(error)) return;
        void import("#/lib/atproto/reauth-toast").then(
          ({ showReauthToast }) => {
            showReauthToast();
          },
        );
      },
    }),
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }

  browserQueryClient ??= makeQueryClient();

  return browserQueryClient;
}
