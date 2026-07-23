import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { dbValueToCountOldPostsAsUnread } from "#/lib/count-old-posts-as-unread";
import { dbValueToTrackReadingHistory } from "#/lib/track-reading-history";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import { observe } from "#/server/observability/log";
import type { ShellSnapshot } from "#/server/reader/shell-snapshot.server";
import { loadShellSnapshot } from "#/server/reader/shell-snapshot.server";

/** Signed-in shell: sidebar + own lists + saved lists in one round trip. */
const getShellSnapshot = createServerFn({ method: "GET" }).handler(
  observe(
    "shell.getShellSnapshot",
    async (_, span): Promise<ShellSnapshot | null> => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        return null;
      }
      span.set("did", session.did);

      const [{ db }, schema] = await Promise.all([
        import("#/db/index.server"),
        import("#/db/schema"),
      ]);
      const trackReading = dbValueToTrackReadingHistory(
        session.session.user.trackReadingHistory ?? null,
      );
      const countOldPostsAsUnread = dbValueToCountOldPostsAsUnread(
        session.session.user.countOldPostsAsUnread ?? null,
      );

      return loadShellSnapshot(db, schema, {
        did: session.did,
        client: session.client,
        trackReading,
        countOldPostsAsUnread,
      });
    },
  ),
);

function getShellSnapshotQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "shellSnapshot"] as const,
    queryFn: async () => getShellSnapshot(),
    staleTime: 5 * 60_000,
  });
}

export const shellApi = {
  getShellSnapshot,
  getShellSnapshotQueryOptions,
};
