import type { Client } from "@atcute/client";
import { isDid } from "@atcute/lexicons/syntax";
import { getRequest, setCookie } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { cache } from "react";

import type { db as DrizzleDb } from "#/db/index.server";
import type * as DbSchema from "#/db/schema";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import { logEvent } from "#/server/observability/log";

type Db = typeof DrizzleDb;
type Schema = typeof DbSchema;

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
      countOldPostsAsUnread: boolean | null;
      collectionsAuthoringEnabled: boolean | null;
      userinputFeedbackEnabled: boolean | null;
      marginSaveEnabled: boolean | null;
      sembleSaveEnabled: boolean | null;
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

/** Rolling app-session lifetime; mirrors the initial value in callback.server.ts. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Extend at most once per session per day to keep this off the read hot path. */
const SESSION_EXTEND_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Slide an active session's expiry forward so a still-used session never hits
 * its fixed 30-day cap (the bug where logged-in users get kicked out after a
 * few weeks). Throttled via `session.updatedAt` (bumped by the schema's
 * `$onUpdate`) as a "last extended" stamp — no extra column needed. The DB
 * write is fire-and-forget so it never lands on a read path's critical path,
 * and the cookie is re-issued with a fresh Max-Age so the browser copy doesn't
 * expire at the original 30-day mark either. Idle sessions (>30 days) still
 * expire. Safe to call on every resolved session row; it self-throttles.
 */
function maybeExtendSession(
  row: { id: string; token: string; updatedAt: Date; expiresAt: Date },
  db: Db,
  schema: Schema,
): void {
  const now = Date.now();
  if (now - row.updatedAt.getTime() < SESSION_EXTEND_MIN_INTERVAL_MS) {
    return;
  }

  void db
    .update(schema.session)
    .set({ expiresAt: new Date(now + SESSION_TTL_MS) })
    .where(eq(schema.session.id, row.id))
    .then(() => {
      // Confirms sliding renewal is firing for active users (~once/day/session).
      logEvent("auth.session.extended", { session_id: row.id });
    })
    .catch((error: unknown) => {
      logEvent("auth.session.extend_failed", {
        session_id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  // Best-effort cookie refresh: only possible inside an active request context
  // (SSR loaders / server fns). When absent, the DB expiry is authoritative and
  // the next request that has a context re-sets it. Attributes mirror
  // callback.server.ts so this replaces the cookie rather than duplicating it.
  try {
    const isSecure = getRequest().url.startsWith("https://");
    setCookie(AUTH_SESSION_TOKEN_COOKIE, row.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      maxAge: SESSION_TTL_MS / 1000,
    });
  } catch {
    // No active request context — DB expiry is authoritative.
  }
}

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
  /** Reader's userinput feedback upgrade flag (DB column). `true` means
   * subsequent authorize flows request the userinput discussion OAuth scope. */
  userinputFeedbackEnabled: boolean | null;
  /** Reader's Margin save upgrade flag (DB column). `true` means subsequent
   * authorize flows request the `at.margin.authFull` OAuth scope. */
  marginSaveEnabled: boolean | null;
  /** Reader's Semble/Cosmik save upgrade flag (DB column), mirroring
   * {@link marginSaveEnabled} for `network.cosmik.authFull`. */
  sembleSaveEnabled: boolean | null;
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
        userinputFeedbackEnabled: result.session.user.userinputFeedbackEnabled,
        marginSaveEnabled: result.session.user.marginSaveEnabled,
        sembleSaveEnabled: result.session.user.sembleSaveEnabled,
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
          userinputFeedbackEnabled: true,
          marginSaveEnabled: true,
          sembleSaveEnabled: true,
        },
      },
    },
  });

  if (!sessionRow || sessionRow.expiresAt.getTime() <= Date.now()) {
    return;
  }

  maybeExtendSession(sessionRow, db, schema);

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
    userinputFeedbackEnabled: sessionRow.user.userinputFeedbackEnabled,
    marginSaveEnabled: sessionRow.user.marginSaveEnabled,
    sembleSaveEnabled: sessionRow.user.sembleSaveEnabled,
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

  maybeExtendSession(sessionRow, db, schema);

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

  maybeExtendSession(sessionRow, db, schema);

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
