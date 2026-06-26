import type { Did } from "@atcute/lexicons";

import { Client } from "@atcute/client";
import {
  isAppPasswordAuthEnabled,
  restoreAppPasswordClient,
} from "#/integrations/auth/app-password-session.server";
import { restoreAtprotoSession } from "#/integrations/auth/atproto";

/**
 * How long a restored client stays cached. The client is a stateless
 * credential wrapper — the underlying session token is stored in the DB with
 * its own expiry, and `manager.resume()` self-heals on failure (it deletes the
 * stale session and returns null). A short TTL avoids hammering the PDS with
 * `resume()` calls across the many server fns a single page load invokes, while
 * still refreshing often enough to pick up token rotations.
 */
const CLIENT_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  client: Client | null;
  expiresAt: number;
}

const clientCache = new Map<Did, Promise<CacheEntry>>();

/**
 * Restore an authenticated AT Proto client for the given DID.
 *
 * In dev/perf (app-password mode), the OAuth session restore always fails for
 * these users — trying it first wastes a network round trip to the PDS before
 * the fallback runs. When app-password auth is enabled, try it first and skip
 * the OAuth attempt entirely on success.
 *
 * The result is memoized by DID for {@link CLIENT_CACHE_TTL_MS} so that a
 * single page load — which may call this 6+ times across server fns — only hits
 * the PDS once. Without this, each `createServerFn` RPC during SSR re-resolves
 * the session because the React `cache()` in `getAtprotoSessionForRequest` only
 * dedupes when `request === getRequest()`, and server-fn calls get different
 * request objects.
 */
export async function restoreAuthenticatedClient(
  did: Did,
): Promise<Client | null> {
  const cached = clientCache.get(did);
  if (cached) {
    const entry = await cached;
    if (entry.expiresAt > Date.now()) {
      return entry.client;
    }
    // Expired — fall through and re-resolve.
    clientCache.delete(did);
  }

  const promise = (async (): Promise<CacheEntry> => {
    const client = await restoreUncached(did);
    return {
      client,
      expiresAt: Date.now() + CLIENT_CACHE_TTL_MS,
    };
  })();

  // Store the in-flight promise so concurrent callers within the same tick
  // share a single resolution rather than each kicking off a PDS call.
  clientCache.set(did, promise);

  try {
    const entry = await promise;
    return entry.client;
  } catch (err) {
    // Don't poison the cache on error — let the next caller retry.
    clientCache.delete(did);
    throw err;
  }
}

async function restoreUncached(did: Did): Promise<Client | null> {
  if (isAppPasswordAuthEnabled()) {
    const appPasswordClient = await restoreAppPasswordClient(did);
    if (appPasswordClient) {
      return new Client({ handler: appPasswordClient });
    }
    // App-password session missing/expired — fall through to OAuth.
  }

  const oauthSession = await restoreAtprotoSession(did);
  if (oauthSession) {
    return new Client({ handler: oauthSession });
  }

  // Last resort: app-password when not already tried above.
  if (!isAppPasswordAuthEnabled()) {
    const appPasswordClient = await restoreAppPasswordClient(did);
    if (!appPasswordClient) {
      return null;
    }
    return new Client({ handler: appPasswordClient });
  }

  return null;
}
