import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { getReaderDidForRequest } from "#/middleware/auth-session.server";
import { observe } from "#/server/observability/log";
import type { FollowedUserStats } from "#/server/reader/queries";
import { followedUserStats } from "#/server/reader/queries";
import { effectiveFollowSets } from "#/server/reader/saved-lists";

import { dbMiddleware } from "./db-middleware";

/**
 * Subscriptions directory (`/subscriptions`) — the one query the page adds on
 * top of the shell.
 *
 * Publication rows come free: the app shell already holds them in the
 * `["feed", "sidebar"]` cache, complete with per-publication counts. Followed
 * *people* carry no equivalent aggregates in that snapshot (the sidebar only
 * needs their name and unread count), so the directory's Articles / Last post /
 * Followers columns would be empty for every person row. This fills them in
 * with one grouped round trip, kept out of `loadSidebarData` so the cost lands
 * on the page that needs it rather than on every shell render.
 */

export type SubscriptionPeopleStats = Record<string, FollowedUserStats>;

const getSubscriptionPeopleStats = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe(
      "subscriptions.getPeopleStats",
      async ({ context }, span): Promise<SubscriptionPeopleStats> => {
        const did = await getReaderDidForRequest(getRequest());
        if (!did) {
          return {};
        }
        span.set("did", did);

        const { userDids } = await effectiveFollowSets(
          context.db,
          context.schema,
          did,
        );
        span.set("people", userDids.length);
        if (userDids.length === 0) {
          return {};
        }

        const stats = await followedUserStats(
          context.db,
          context.schema,
          userDids,
        );
        return Object.fromEntries(stats.map((row) => [row.did, row]));
      },
    ),
  );

function getSubscriptionPeopleStatsQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "subscriptionPeopleStats"] as const,
    queryFn: async () => getSubscriptionPeopleStats(),
    // Publishing activity moves slowly; the shell's own follow data is cached
    // for the same window (SHELL_QUERY_STALE_TIME_MS).
    staleTime: 5 * 60_000,
  });
}

export const subscriptionsApi = {
  getSubscriptionPeopleStats,
  getSubscriptionPeopleStatsQueryOptions,
};
