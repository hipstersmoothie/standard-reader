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

/**
 * Whether posts published before the reader subscribed to their source should
 * still count as unread (dots + counts). See `#/lib/count-old-posts-as-unread`.
 *
 * Resolves the preference from the DB `user` row (joined to the session token),
 * mirroring {@link resolveTrackReadingHistoryEnabled} — a single boolean on the
 * user row, so the PDS client is never restored for it. Off-request callers
 * (scripts) fall back to the default (on), preserving today's behaviour.
 */
export async function resolveCountOldPostsAsUnreadEnabled(
  db: Db,
  schema: Schema,
): Promise<boolean> {
  let request: Request;
  try {
    request = getRequest();
  } catch {
    return DEFAULT_COUNT_OLD_POSTS_AS_UNREAD;
  }

  const sessionToken = readSessionTokenCookie(request.headers.get("cookie"));
  if (sessionToken) {
    const sessionRow = await db.query.session.findFirst({
      where: eq(schema.session.token, sessionToken),
      with: { user: { columns: { countOldPostsAsUnread: true } } },
    });

    if (
      sessionRow &&
      sessionRow.expiresAt.getTime() > Date.now() &&
      sessionRow.user
    ) {
      return dbValueToCountOldPostsAsUnread(
        sessionRow.user.countOldPostsAsUnread ?? null,
      );
    }
  }

  return parseCountOldPostsAsUnreadCookie(
    getCookie(COUNT_OLD_POSTS_AS_UNREAD_COOKIE),
  );
}
