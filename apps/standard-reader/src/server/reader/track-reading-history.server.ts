import { getCookie, getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import {
  TRACK_READING_HISTORY_COOKIE,
  dbValueToTrackReadingHistory,
  parseTrackReadingHistoryCookie,
} from "#/lib/track-reading-history";

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
 * Whether this request should record reads and surface unread state.
 *
 * Resolves the preference from the DB `user` row (joined to the session token)
 * — **not** via `getAtprotoSessionForRequest()`, which restores the PDS client
 * (a network round trip to `manager.resume()`). Track-reading is a single
 * boolean on the user row; the PDS client is never needed for it.
 */
export async function resolveTrackReadingHistoryEnabled(
  db: Db,
  schema: Schema,
): Promise<boolean> {
  let request: Request;
  try {
    request = getRequest();
  } catch {
    // Scripts and in-process callers outside TanStack Start request scope.
    return false;
  }

  const sessionToken = readSessionTokenCookie(request.headers.get("cookie"));
  if (sessionToken) {
    const sessionRow = await db.query.session.findFirst({
      where: eq(schema.session.token, sessionToken),
      with: { user: { columns: { trackReadingHistory: true } } },
    });

    if (
      sessionRow &&
      sessionRow.expiresAt.getTime() > Date.now() &&
      sessionRow.user
    ) {
      return dbValueToTrackReadingHistory(
        sessionRow.user.trackReadingHistory ?? null,
      );
    }
  }

  return parseTrackReadingHistoryCookie(
    getCookie(TRACK_READING_HISTORY_COOKIE),
  );
}
