import { getCookie, getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import type { BridgeExclusion } from "#/lib/atproto/bridged-repo";
import {
  COUNT_OLD_POSTS_AS_UNREAD_COOKIE,
  DEFAULT_COUNT_OLD_POSTS_AS_UNREAD,
  dbValueToCountOldPostsAsUnread,
  parseCountOldPostsAsUnreadCookie,
} from "#/lib/count-old-posts-as-unread";
import { dbValuesToBridgeExclusion } from "#/lib/exclude-web-bridge";
import {
  TRACK_READING_HISTORY_COOKIE,
  dbValueToTrackReadingHistory,
  parseTrackReadingHistoryCookie,
} from "#/lib/track-reading-history";

export interface ReaderSessionPreferences {
  trackReadingEnabled: boolean;
  countOldPostsAsUnreadEnabled: boolean;
  /**
   * How much of Bridgy Fed this request hides — see {@link BridgeExclusion}.
   *
   * `"all"` for anyone without a reader session: the signed-out app shows no
   * bridged accounts at all. A signed-in reader gets their own "Hide mirrored
   * websites" setting (`#/lib/exclude-web-bridge`) instead, which covers the
   * web bridge only, is account-level with no cookie mirror, and is off by
   * default — so signing in *adds* the bridges back rather than taking
   * anything away.
   */
  excludeBridged: BridgeExclusion;
  /**
   * Whether a live reader session backed the preferences above. Callers that
   * authenticate some *other* way — the XRPC AppView, whose clients carry a
   * DID token and no cookie — use it to tell a genuine signed-out reader from
   * a signed-in caller this resolver cannot see.
   */
  hasReaderSession: boolean;
}

/**
 * What a request with no reader session sees: every `*.brid.gy` repo hidden,
 * both the bulk web mirrors and the opt-in ActivityPub bridge.
 *
 * Signed out there is nothing of the reader's own on the page — no
 * subscriptions, no preferences, no history — so the network-wide surfaces are
 * the whole product, and what they should show is writing published natively to
 * AT Protocol. The bridges come back on sign-in, where the reader's own setting
 * governs them.
 */
const SIGNED_OUT_EXCLUDE_BRIDGED: BridgeExclusion = "all";

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
    excludeBridged: SIGNED_OUT_EXCLUDE_BRIDGED,
    hasReaderSession: false,
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
      // Not a page view: scripts and the digest resolve the reader they run
      // for themselves, so nothing here is "signed out".
      excludeBridged: false,
      hasReaderSession: false,
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
            excludeWebBridge: true,
            excludeAllBridges: true,
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
        excludeBridged: dbValuesToBridgeExclusion(sessionRow.user),
        hasReaderSession: true,
      };
    }
  }

  return preferencesFromCookies();
}
