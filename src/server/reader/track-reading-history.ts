import type {
  ArticleCard,
  Db,
  Schema,
} from "#/integrations/tanstack-query/api-shapes";

import { getCookie, getRequest } from "@tanstack/react-start/server";
import {
  TRACK_READING_HISTORY_COOKIE,
  dbValueToTrackReadingHistory,
  parseTrackReadingHistoryCookie,
} from "#/lib/track-reading-history";
import { getAtprotoSessionForRequest } from "#/middleware/auth";
import { eq } from "drizzle-orm";

/** Whether this request should record reads and surface unread state. */
export async function resolveTrackReadingHistoryEnabled(
  db: Db,
  schema: Schema,
): Promise<boolean> {
  const request = getRequest();
  const session = await getAtprotoSessionForRequest(request);
  if (session?.session.user.id) {
    const row = await db.query.user.findFirst({
      where: eq(schema.user.id, session.session.user.id),
      columns: { trackReadingHistory: true },
    });
    return dbValueToTrackReadingHistory(row?.trackReadingHistory ?? null);
  }

  return parseTrackReadingHistoryCookie(
    getCookie(TRACK_READING_HISTORY_COOKIE),
  );
}

export function articleCardsAsAllRead(
  items: Array<ArticleCard>,
): Array<ArticleCard> {
  return items.map((item) => ({ ...item, isRead: true }));
}
