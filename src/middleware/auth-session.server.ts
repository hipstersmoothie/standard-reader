import type { Client } from "@atcute/client";

import { isDid } from "@atcute/lexicons/syntax";
import { getRequest } from "@tanstack/react-start/server";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import { eq } from "drizzle-orm";
import { cache } from "react";

export type AtprotoSessionContext = {
  did: string;
  atprotoSession: unknown;
  client: Client;
  session: {
    user: {
      id: string;
      name: string;
      email: string | null;
      did: string | null;
      image: string | null;
      isAdmin: boolean;
      homeScope: string | null;
      trackReadingHistory: boolean | null;
    };
  };
};

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
 * Short-lived cache of resolved sessions keyed by session token. The React
 * `cache()` below only dedupes when `request === getRequest()`, but server-fn
 * RPC calls during SSR each get a different request object — so without this,
 * every server fn re-queries the DB for the session row + user row. A 30s TTL
 * is safe: the session row has its own expiry, and a logout creates a new token.
 */
const SESSION_CACHE_TTL_MS = 30_000;

interface SessionCacheEntry {
  result: AtprotoSessionContext | undefined;
  expiresAt: number;
}

const sessionTokenCache = new Map<string, SessionCacheEntry>();

async function resolveAtprotoSession(
  request: Request,
): Promise<AtprotoSessionContext | undefined> {
  const sessionToken = readSessionTokenCookie(request.headers.get("cookie"));
  if (!sessionToken) {
    return;
  }

  const cached = sessionTokenCache.get(sessionToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);

  const sessionRow = await db.query.session.findFirst({
    where: eq(schema.session.token, sessionToken),
    with: { user: true },
  });

  if (!sessionRow || sessionRow.expiresAt.getTime() <= Date.now()) {
    return;
  }

  const userRow = sessionRow.user;
  const did = userRow?.did;
  if (!did || !isDid(did)) {
    return;
  }

  const { restoreAuthenticatedClient } =
    await import("#/integrations/auth/restore-client.server");
  const client = await restoreAuthenticatedClient(did);
  if (!client) {
    return;
  }

  const result = { did, atprotoSession: client, client, session: { user: userRow } };
  // Cache the resolved session by token so sibling server fns in the same
  // page load reuse it instead of each re-querying the DB for the session row.
  sessionTokenCache.set(sessionToken, {
    result,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
  return result;
}

/** Per-request dedupe when handlers share the active TanStack Start request. */
const resolveAtprotoSessionCached = cache(async () =>
  resolveAtprotoSession(getRequest()),
);

/**
 * Session + ATProto `Client` when the request carries a valid app session
 * token AND the user's stored OAuth session is still restorable.
 */
export async function getAtprotoSessionForRequest(
  request: Request,
): Promise<AtprotoSessionContext | undefined> {
  if (request === getRequest()) {
    return resolveAtprotoSessionCached();
  }
  return resolveAtprotoSession(request);
}
