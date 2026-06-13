import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";

import { getCookie, getRequest } from "@tanstack/react-start/server";
import {
  TRACK_READING_HISTORY_COOKIE,
  dbValueToTrackReadingHistory,
  parseTrackReadingHistoryCookie,
} from "#/lib/track-reading-history";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";

/** Whether this request should record reads and surface unread state. */
export async function resolveTrackReadingHistoryEnabled(
  _db: Db,
  _schema: Schema,
): Promise<boolean> {
  let request: Request;
  try {
    request = getRequest();
  } catch {
    // Scripts and in-process callers outside TanStack Start request scope.
    return false;
  }

  const session = await getAtprotoSessionForRequest(request);
  if (session?.session.user.id) {
    return dbValueToTrackReadingHistory(
      session.session.user.trackReadingHistory ?? null,
    );
  }

  return parseTrackReadingHistoryCookie(
    getCookie(TRACK_READING_HISTORY_COOKIE),
  );
}
