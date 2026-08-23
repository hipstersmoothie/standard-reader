/**
 * HappyView-brokered OAuth client (@happyview/oauth-client-node).
 *
 * Why this exists: writing to a permissioned space needs a DPoP-bound token
 * whose key HappyView provisioned. Our plain atproto OAuth (atproto.server.ts)
 * mints its own DPoP key that HappyView has never seen, so space writes fail
 * with `no DPoP key matching proof thumbprint`. The HappyView SDK runs the same
 * PDS OAuth but (1) provisions the DPoP key from HappyView first and (2)
 * registers the resulting tokens with HappyView, so the key is recognized.
 *
 * This is only used when HappyView is configured; otherwise sign-in stays on the
 * atproto client and the permissioned-space paths no-op. The OAuth still runs
 * against the user's PDS — HappyView is reached app→server for key provisioning
 * and token registration — so a loopback (localhost) client works: the PDS skips
 * metadata fetch for `http://localhost`, and nothing needs to reach the app.
 */

import type { StorageAdapter } from "@happyview/oauth-client-node";
import { HappyViewNodeClient } from "@happyview/oauth-client-node";
import { verification } from "@standard-reader/db/schema";
import { eq } from "drizzle-orm";

import { getDb } from "../../db/index.server";
import { getPublicUrl } from "../../lib/public-url";
import { getHappyViewConfig } from "../../server/happyview/config";
import { OAUTH_SCOPE } from "./atproto.server";

const STORE_PREFIX = "newsletter-happyview";
const CALLBACK_PATH = "/api/auth/happyview/callback";
/** HappyView sessions and pending-auth entries persist this long. */
const ENTRY_TTL_MS = 180 * 24 * 60 * 60_000;

/** The AuthorSession shape the permissioned-space code consumes. */
export interface AuthorSession {
  did: string;
  handle: (url: string, init?: RequestInit) => Promise<Response>;
}

function requireDb() {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required for authentication.");
  return db;
}

/**
 * The SDK's `StorageAdapter` (opaque string get/set/delete) over the shared
 * `verification` KV table, namespaced so it can't collide with the atproto
 * client's own store. Entries carry a far-future expiry — the SDK deletes its
 * own pending-auth/session keys explicitly.
 */
const storage: StorageAdapter = {
  async get(key) {
    const db = requireDb();
    const row = await db.query.verification.findFirst({
      where: eq(verification.identifier, `${STORE_PREFIX}:${key}`),
    });
    return row?.value ?? null;
  },
  async set(key, value) {
    const db = requireDb();
    const identifier = `${STORE_PREFIX}:${key}`;
    await db
      .insert(verification)
      .values({
        id: crypto.randomUUID(),
        identifier,
        value,
        expiresAt: new Date(Date.now() + ENTRY_TTL_MS),
      })
      .onConflictDoUpdate({
        target: verification.identifier,
        set: { value, updatedAt: new Date() },
      });
  },
  async delete(key) {
    const db = requireDb();
    await db
      .delete(verification)
      .where(eq(verification.identifier, `${STORE_PREFIX}:${key}`));
  },
};

function baseUrl(): string {
  return getPublicUrl().replace(/\/+$/, "");
}

function callbackUri(): string {
  return `${baseUrl().replace("localhost", "127.0.0.1")}${CALLBACK_PATH}`;
}

function isLoopback(): boolean {
  const b = baseUrl();
  return b.startsWith("http://localhost") || b.startsWith("http://127.0.0.1");
}

/**
 * The atproto OAuth `client_id`. On loopback the spec form `http://localhost`
 * with the redirect_uri + scope as query params (the PDS derives metadata from
 * it, no fetch). Deployed, it's the client-metadata document HappyView and the
 * PDS can fetch.
 */
function clientId(): string {
  if (isLoopback()) {
    const params = new URLSearchParams({
      redirect_uri: callbackUri(),
      scope: OAUTH_SCOPE,
    });
    return `http://localhost?${params.toString()}`;
  }
  return `${baseUrl()}/api/auth/happyview/client-metadata.json`;
}

let cached: HappyViewNodeClient | null | undefined;

/** The HappyView OAuth client, or null when HappyView isn't configured. */
export function getHappyViewOAuth(): HappyViewNodeClient | null {
  if (cached !== undefined) return cached;
  const config = getHappyViewConfig();
  if (!config) {
    cached = null;
    return cached;
  }
  cached = new HappyViewNodeClient({
    instanceUrl: config.url,
    clientId: clientId(),
    clientKey: config.clientKey,
    clientSecret: config.clientSecret,
    redirectUri: callbackUri(),
    scopes: OAUTH_SCOPE,
    storage,
  });
  return cached;
}

/** True when sign-in should be brokered through HappyView. */
export function isHappyViewAuth(): boolean {
  return getHappyViewOAuth() !== null;
}

/**
 * Restore a HappyView session as the normalized {@link AuthorSession} the space
 * code needs — its `fetchHandler` signs each request with the HappyView-
 * provisioned DPoP key. Returns null when HappyView is off or no session
 * exists.
 */
export async function restoreHappyViewAuthorSession(
  did: string,
): Promise<AuthorSession | null> {
  const client = getHappyViewOAuth();
  if (!client) return null;
  const session = await client.restore(did);
  return {
    did: session.did,
    handle: (url, init) => session.fetchHandler(url, init ?? {}),
  };
}

/**
 * Restore a DID's session for permissioned-space calls, from whichever client
 * signed them in: the HappyView-brokered client when configured (its DPoP key
 * is provisioned by HappyView, so writes are accepted), else the plain atproto
 * client. Returns null when no session can be restored. The single place space
 * code should get an author session.
 */
export async function restoreAuthorSession(
  did: string,
): Promise<AuthorSession | null> {
  try {
    if (getHappyViewOAuth()) return await restoreHappyViewAuthorSession(did);
    const { atprotoOAuth } = await import("./atproto.server");
    const session = await atprotoOAuth.restore(
      did as Parameters<typeof atprotoOAuth.restore>[0],
    );
    return {
      did: session.did,
      handle: (url, init) => session.handle(url, init),
    };
  } catch (error) {
    console.error("[happyview] restore author session failed:", error);
    return null;
  }
}
