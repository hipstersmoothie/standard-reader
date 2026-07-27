import { getCookie, getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import {
  COUNT_OLD_POSTS_AS_UNREAD_COOKIE,
  DEFAULT_COUNT_OLD_POSTS_AS_UNREAD,
  dbValueToCountOldPostsAsUnread,
  parseCountOldPostsAsUnreadCookie,
} from "#/lib/count-old-posts-as-unread";
import {
  TRACK_READING_HISTORY_COOKIE,
  dbValueToTrackReadingHistory,
  parseTrackReadingHistoryCookie,
} from "#/lib/track-reading-history";

export interface ReaderSessionPreferences {
  trackReadingEnabled: boolean;
  countOldPostsAsUnreadEnabled: boolean;
}

function readSessionTokenCookie(
  cookieHeader: string | null,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split("; ")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const name = pair.slice(0, eqIdx);
    if (name === AUTH_SESSION_TOKEN_COOKIE) {
      return pair.slice(eqIdx + 1);
    }
  }
  return undefined;
}

/** Cookie-only fallback, used off-request and for guests / expired sessions. */
function preferencesFromCookies(): ReaderSessionPreferences {
  return {
    trackReadingEnabled: parseTrackReadingHistoryCookie(
      getCookie(TRACK_READING_HISTORY_COOKIE),
    ),
    countOldPostsAsUnreadEnabled: parseCountOldPostsAsUnreadCookie(
      getCookie(COUNT_OLD_POSTS_AS_UNREAD_COOKIE),
    ),
  };
}

/**
 * Both reader feed preferences in a single session lookup.
 *
 * These are two booleans on the same `user` row reached through the same
 * session token, so resolving them separately issued two identical
 * `session.findFirst` queries per request. Every caller wants the pair, so read
 * the row once and derive both.
 *
 * Resolved from the DB row — **not** via `getAtprotoSessionForRequest()`, which
 * restores the PDS client (a network round trip). Neither preference needs it.
 */
export async function resolveReaderSessionPreferences(
  db: Db,
  schema: Schema,
): Promise<ReaderSessionPreferences> {
  let request: Request;
  try {
    request = getRequest();
  } catch {
    // Scripts and in-process callers outside TanStack Start request scope.
    return {
      trackReadingEnabled: false,
      countOldPostsAsUnreadEnabled: DEFAULT_COUNT_OLD_POSTS_AS_UNREAD,
    };
  }

  const sessionToken = readSessionTokenCookie(request.headers.get("cookie"));
  if (sessionToken) {
    const sessionRow = await db.query.session.findFirst({
      where: eq(schema.session.token, sessionToken),
      with: {
        user: {
          columns: {
            trackReadingHistory: true,
            countOldPostsAsUnread: true,
          },
        },
      },
    });

    if (
      sessionRow &&
      sessionRow.expiresAt.getTime() > Date.now() &&
      sessionRow.user
    ) {
      return {
        trackReadingEnabled: dbValueToTrackReadingHistory(
          sessionRow.user.trackReadingHistory ?? null,
        ),
        countOldPostsAsUnreadEnabled: dbValueToCountOldPostsAsUnread(
          sessionRow.user.countOldPostsAsUnread ?? null,
        ),
      };
    }
  }

  return preferencesFromCookies();
}
