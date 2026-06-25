import { MutationCache, QueryClient, isServer } from "@tanstack/react-query";
import { isAtprotoScopeMissingError } from "#/lib/atproto/scope-error";

const DEFAULT_QUERY_STALE_TIME_MS = 60 * 1000;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
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
        void import("#/lib/atproto/reauth-toast").then(({ showReauthToast }) => {
          showReauthToast();
        });
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
