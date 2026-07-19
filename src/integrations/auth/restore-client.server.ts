import { Client, retryFetchHandler } from "@atcute/client";
import type { FetchHandler, FetchHandlerObject } from "@atcute/client";
import type { Did } from "@atcute/lexicons";

import {
  isAppPasswordAuthEnabled,
  restoreAppPasswordClient,
} from "#/integrations/auth/app-password-session.server";
import { restoreAtprotoSession } from "#/integrations/auth/atproto";
import { logEvent } from "#/server/observability/log";

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
 * Evict a DID's cached client. Callers that revoke a session and immediately
 * establish a new one (the collections/userinput/review upgrade flows all
 * revoke + re-authorize on the same DID) must call this — otherwise a request
 * within {@link CLIENT_CACHE_TTL_MS} of the revoke gets back the stale client,
 * still bound to the old session's DPoP key, while the DB now holds a token
 * issued under a *different* key from the fresh authorize. Signing with the
 * stale key against the new token fails PDS-side with "Invalid DPoP key
 * binding" — see the `upgradeToUserinputFeedback` incident this was added for.
 */
export function invalidateAuthenticatedClientCache(did: Did): void {
  clientCache.delete(did);
}

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
  } catch (error) {
    // Don't poison the cache on error — let the next caller retry.
    clientCache.delete(did);
    throw error;
  }
}

/**
 * Longest we'll sit on a rate-limited request before giving up. Every PDS call
 * here is inside a user-facing request, so this bounds the latency a retry can
 * add. `retryFetchHandler` treats an authoritative `Retry-After` longer than
 * this as "don't retry" rather than "retry early", so we back off to the
 * caller instead of hammering a window that hasn't reset.
 */
const PDS_RETRY_MAX_DELAY_MS = 10_000;

/**
 * Wrap a session handler so rate-limited PDS writes back off instead of failing
 * outright. Delay comes from the server's own `Retry-After` / `RateLimit-Reset`
 * when present, falling back to jittered exponential backoff.
 *
 * This matters most for batched writes (marking a large backlog read), where a
 * single 429 previously discarded the whole atomic batch with nothing written.
 */
function withRateLimitRetry(
  handler: FetchHandler | FetchHandlerObject,
  did: Did,
): FetchHandler {
  return retryFetchHandler({
    handler,
    maxDelay: PDS_RETRY_MAX_DELAY_MS,
    onRetry: (response, attempt, delay) => {
      logEvent("atproto.pdsRetry", {
        did,
        status: response.status,
        attempt,
        delayMs: Math.round(delay),
      });
    },
  });
}

async function restoreUncached(did: Did): Promise<Client | null> {
  if (isAppPasswordAuthEnabled()) {
    const appPasswordClient = await restoreAppPasswordClient(did);
    if (appPasswordClient) {
      return new Client({
        handler: withRateLimitRetry(appPasswordClient, did),
      });
    }
    // App-password session missing/expired — fall through to OAuth.
  }

  const oauthSession = await restoreAtprotoSession(did);
  if (oauthSession) {
    return new Client({ handler: withRateLimitRetry(oauthSession, did) });
  }

  return null;
}
