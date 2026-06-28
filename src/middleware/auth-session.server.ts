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
      collectionsAuthoringEnabled: boolean | null;
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

/**
 * Lightweight DID-only cache. Read-only server fns (`getSaved`, `getLikes`,
 * …) only need the reader's DID for DB queries — restoring the PDS client
 * (`manager.resume()`) is a wasted network round trip. This cache holds the
 * DID resolved from the DB session row so sibling read fns during the same
 * page load share one DB query instead of each re-resolving.
 */
interface DidCacheEntry {
  did: string | undefined;
  expiresAt: number;
}

const didTokenCache = new Map<string, DidCacheEntry>();

/** Reader identity from the DB session row — no PDS client restore. */
export interface ReaderContext {
  /** Reader's ATProto DID (the repo authority). */
  did: string;
  /** Reader's app `user.id` (DB row key, for preferences like themeMode). */
  userId: string;
  /** Reader's home feed scope preference (DB column). */
  homeScope: string | null;
  /** Reader's reading-history tracking preference (DB column). */
  trackReadingHistory: boolean | null;
  /** Reader's collections-authoring upgrade flag (DB column). `true` means
   * subsequent authorize flows request the collections OAuth scope tier. */
  collectionsAuthoringEnabled: boolean | null;
}

/**
 * The signed-in reader's DID + user ID resolved from the DB session row, with
 * no PDS client restore. Use this for read paths that only need identity +
 * preferences (theme mode, etc). When a server fn needs the live PDS `client`
 * (write paths, reading the reader's own repo), use
 * {@link getAtprotoSessionForRequest} instead — but only inside the branch
 * that actually needs it, so the `manager.resume()` network round trip
 * doesn't land on the critical path of every read.
 */
export async function getReaderContextForRequest(
  request: Request,
): Promise<ReaderContext | undefined> {
  const sessionToken = readSessionTokenCookie(request.headers.get("cookie"));
  if (!sessionToken) {
    return;
  }

  const cached = readerContextCache.get(sessionToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ctx;
  }

  // Reuse the full session cache when a sibling write fn already restored it.
  const fullSession = sessionTokenCache.get(sessionToken);
  if (fullSession?.expiresAt && fullSession.expiresAt > Date.now()) {
    const result = fullSession.result;
    if (result?.did && result.session.user.id) {
      return {
        did: result.did,
        userId: result.session.user.id,
        homeScope: result.session.user.homeScope,
        trackReadingHistory: result.session.user.trackReadingHistory,
        collectionsAuthoringEnabled:
          result.session.user.collectionsAuthoringEnabled,
      };
    }
  }

  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);

  const sessionRow = await db.query.session.findFirst({
    where: eq(schema.session.token, sessionToken),
    with: {
      user: {
        columns: {
          id: true,
          did: true,
          homeScope: true,
          trackReadingHistory: true,
          collectionsAuthoringEnabled: true,
        },
      },
    },
  });

  if (!sessionRow || sessionRow.expiresAt.getTime() <= Date.now()) {
    return;
  }

  const did = sessionRow.user?.did;
  const userId = sessionRow.user?.id;
  if (!did || !isDid(did) || !userId) {
    return;
  }

  const ctx = {
    did,
    userId,
    homeScope: sessionRow.user.homeScope,
    trackReadingHistory: sessionRow.user.trackReadingHistory,
    collectionsAuthoringEnabled: sessionRow.user.collectionsAuthoringEnabled,
  };
  readerContextCache.set(sessionToken, {
    ctx,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
  // Keep the DID-only cache in sync so sibling read fns that already ran
  // don't re-query.
  didTokenCache.set(sessionToken, {
    did,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
  return ctx;
}

interface ReaderContextCacheEntry {
  ctx: ReaderContext | undefined;
  expiresAt: number;
}

const readerContextCache = new Map<string, ReaderContextCacheEntry>();

async function resolveReaderDid(request: Request): Promise<string | undefined> {
  const sessionToken = readSessionTokenCookie(request.headers.get("cookie"));
  if (!sessionToken) {
    return;
  }

  const cached = didTokenCache.get(sessionToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.did;
  }

  // Reuse the full session cache when a sibling write fn already restored it.
  const fullSession = sessionTokenCache.get(sessionToken);
  if (fullSession?.expiresAt && fullSession.expiresAt > Date.now()) {
    return fullSession.result?.did;
  }

  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);

  const sessionRow = await db.query.session.findFirst({
    where: eq(schema.session.token, sessionToken),
    with: { user: { columns: { did: true } } },
  });

  if (!sessionRow || sessionRow.expiresAt.getTime() <= Date.now()) {
    return;
  }

  const did = sessionRow.user?.did;
  if (!did || !isDid(did)) {
    return;
  }

  didTokenCache.set(sessionToken, {
    did,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
  return did;
}

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

  const result = {
    did,
    atprotoSession: client,
    client,
    session: { user: userRow },
  };
  // Cache the resolved session by token so sibling server fns in the same
  // page load reuse it instead of each re-querying the DB for the session row.
  sessionTokenCache.set(sessionToken, {
    result,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
  // Keep the DID-only cache in sync so read fns that already ran don't
  // re-query when a later write fn restores the full client.
  didTokenCache.set(sessionToken, {
    did,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
  return result;
}

/** Per-request dedupe when handlers share the active TanStack Start request. */
const resolveAtprotoSessionCached = cache(async () =>
  resolveAtprotoSession(getRequest()),
);

const resolveReaderDidCached = cache(async () =>
  resolveReaderDid(getRequest()),
);

/**
 * Session + ATProto `Client` when the request carries a valid app session
 * token AND the user's stored OAuth session is still restorable. Use for write
 * paths that need the PDS `client`.
 */
export async function getAtprotoSessionForRequest(
  request: Request,
): Promise<AtprotoSessionContext | undefined> {
  if (request === getRequest()) {
    return resolveAtprotoSessionCached();
  }
  return resolveAtprotoSession(request);
}

/**
 * The signed-in reader's DID — a single DB session-row lookup with no PDS
 * client restore. Read-only server fns (`getSaved`, `getLikes`, …) only need
 * the DID for DB queries; use this instead of {@link getAtprotoSessionForRequest}
 * to avoid the `manager.resume()` network round trip.
 */
export async function getReaderDidForRequest(
  request: Request,
): Promise<string | undefined> {
  if (request === getRequest()) {
    return resolveReaderDidCached();
  }
  return resolveReaderDid(request);
}
