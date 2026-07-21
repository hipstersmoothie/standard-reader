import {
  CompositeDidDocumentResolver,
  CompositeHandleResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  WellKnownHandleResolver,
} from "@atcute/identity-resolver";
import { NodeDnsHandleResolver } from "@atcute/identity-resolver-node";
import type { Did } from "@atcute/lexicons";
import type {
  ClientAssertionPrivateJwk,
  OAuthClientStores,
  StoredSession,
  StoredState,
} from "@atcute/oauth-node-client";
import { OAuthClient } from "@atcute/oauth-node-client";
import { eq, like } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { getPublicUrl } from "#/lib/public-url";
import { logEvent } from "#/server/observability/log";

import { dbRequestLock } from "./db-lock.server";
import { atstoreReviewClientMetadataScope, clientMetadataScope } from "./scope";

const OAUTH_STORE_PREFIX = "atproto-oauth";
const OAUTH_STATE_TTL_MS = 15 * 60_000;
const OAUTH_SESSION_TTL_MS = 180 * 24 * 60 * 60_000;

type OAuthStoreKind = "session" | "state";

function getStoreIdentifier(kind: OAuthStoreKind, key: string): string {
  return `${OAUTH_STORE_PREFIX}:${kind}:${key}`;
}

function parseStoreJson<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function getSessionExpiry(session: StoredSession): Date {
  const sessionLike = session as unknown as Record<string, unknown>;
  const raw = sessionLike.expiresAt ?? sessionLike.expires_at;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw;
  }
  if (typeof raw === "number" || typeof raw === "string") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(Date.now() + OAUTH_SESSION_TTL_MS);
}

async function getStoreValue<T>(
  kind: OAuthStoreKind,
  key: string,
  consume: boolean,
): Promise<T | undefined> {
  const identifier = getStoreIdentifier(kind, key);

  if (consume) {
    // Atomic delete-and-return to prevent TOCTOU: a concurrent request with
    // the same key can't also read the entry before the delete commits.
    const [deleted] = await db
      .delete(schema.verification)
      .where(eq(schema.verification.identifier, identifier))
      .returning({
        value: schema.verification.value,
        expiresAt: schema.verification.expiresAt,
      });
    if (!deleted) return undefined;
    if (deleted.expiresAt.getTime() <= Date.now()) return undefined;
    return parseStoreJson<T>(deleted.value);
  }

  // Non-consuming read — no TOCTOU concern (no delete follows).
  const entry = await db.query.verification.findFirst({
    where: eq(schema.verification.identifier, identifier),
  });

  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt.getTime() <= Date.now()) {
    await db
      .delete(schema.verification)
      .where(eq(schema.verification.identifier, identifier));
    return undefined;
  }

  const parsed = parseStoreJson<T>(entry.value);
  if (!parsed) {
    await db
      .delete(schema.verification)
      .where(eq(schema.verification.identifier, identifier));
    return undefined;
  }

  return parsed;
}

async function setStoreValue<T>(
  kind: OAuthStoreKind,
  key: string,
  value: T,
  expiresAt: Date,
): Promise<void> {
  const identifier = getStoreIdentifier(kind, key);
  // Atomic upsert: a plain delete-then-insert lets a concurrent writer for the
  // same key interleave (two inserts, or a delete landing between the other's
  // delete and insert), which would leave duplicate rows or drop a just-written
  // token set. `verification.identifier` is UNIQUE, so this collapses to one row.
  await db
    .insert(schema.verification)
    .values({
      id: crypto.randomUUID(),
      identifier,
      value: JSON.stringify(value),
      expiresAt,
    })
    .onConflictDoUpdate({
      target: schema.verification.identifier,
      set: { value: JSON.stringify(value), expiresAt, updatedAt: new Date() },
    });
}

async function deleteStoreValue(
  kind: OAuthStoreKind,
  key: string,
): Promise<void> {
  await db
    .delete(schema.verification)
    .where(eq(schema.verification.identifier, getStoreIdentifier(kind, key)));
}

async function clearStoreValues(kind: OAuthStoreKind): Promise<void> {
  await db
    .delete(schema.verification)
    .where(
      like(schema.verification.identifier, `${OAUTH_STORE_PREFIX}:${kind}:%`),
    );
}

const persistentOAuthStores: OAuthClientStores = {
  sessions: {
    async get(did, options) {
      const consume =
        (options as { consume?: boolean } | undefined)?.consume === true;
      return await getStoreValue<StoredSession>("session", did, consume);
    },
    async set(did, session) {
      await setStoreValue("session", did, session, getSessionExpiry(session));
    },
    async delete(did) {
      await deleteStoreValue("session", did);
    },
    async clear() {
      await clearStoreValues("session");
    },
  },
  states: {
    async get(stateId, options) {
      const consume =
        (options as { consume?: boolean } | undefined)?.consume === true;
      return await getStoreValue<StoredState>("state", stateId, consume);
    },
    async set(stateId, state) {
      await setStoreValue(
        "state",
        stateId,
        state,
        new Date(Date.now() + OAUTH_STATE_TTL_MS),
      );
    },
    async delete(stateId) {
      await deleteStoreValue("state", stateId);
    },
    async clear() {
      await clearStoreValues("state");
    },
  },
};

function getPrivateKey(): ClientAssertionPrivateJwk {
  const keyJson = process.env.ATPROTO_PRIVATE_KEY_JWK;
  if (!keyJson) {
    throw new Error(
      "ATPROTO_PRIVATE_KEY_JWK environment variable is required for the confidential OAuth client.",
    );
  }
  const jwk = JSON.parse(keyJson) as ClientAssertionPrivateJwk;
  // A `kid` is mandatory: the signed client_assertion advertises it in its JWT
  // header and the auth server uses it to find the matching key in our JWKS.
  // Without one, validation fails with "no applicable key found in the JSON Web
  // Key Set". Inject a stable fallback so a key generated without a `kid` (e.g.
  // via `generateClientAssertionKey()` with no argument) still works — both the
  // signer and the published JWKS read it off this same object.
  if (!jwk.kid) {
    jwk.kid = "standard-reader-oauth";
  }
  return jwk;
}

// Shared with OG tags / share URLs — resolves to this deployment's own domain
// on Railway PR previews so the OAuth round-trip returns here, not prod. See
// `getPublicUrl` for the preview-detection rules.
function getBaseUrl(): string {
  return getPublicUrl();
}

function isPublicClient(): boolean {
  const baseUrl = getBaseUrl();
  return (
    baseUrl.startsWith("http://localhost") ||
    baseUrl.startsWith("http://127.0.0.1")
  );
}

type AtprotoOAuthClientKind = "default" | "review";

let _atprotoOAuth: InstanceType<typeof OAuthClient> | null = null;
let _atprotoReviewOAuth: InstanceType<typeof OAuthClient> | null = null;

function metadataScopeForKind(kind: AtprotoOAuthClientKind): Array<string> {
  if (kind === "review") {
    return atstoreReviewClientMetadataScope;
  }
  return clientMetadataScope;
}

function routeBaseForKind(kind: AtprotoOAuthClientKind): string {
  if (kind === "review") {
    return "/api/auth/atproto/review";
  }
  return "/api/auth/atproto";
}

function getRedirectUri(kind: AtprotoOAuthClientKind = "default"): string {
  const baseUrl = getBaseUrl();
  const routeBase = routeBaseForKind(kind);
  const normalizedBaseUrl = baseUrl
    .replace("localhost", "127.0.0.1")
    .replace(/\/$/, "");
  return `${normalizedBaseUrl}${routeBase}/callback`;
}

function createOAuthClient(
  kind: AtprotoOAuthClientKind,
): InstanceType<typeof OAuthClient> {
  const baseUrl = getBaseUrl();
  const redirectUri = getRedirectUri(kind);
  const isPublic = isPublicClient();
  const metadataScope = metadataScopeForKind(kind);
  const routeBase = routeBaseForKind(kind);

  if (isPublic) {
    return new OAuthClient({
      metadata: {
        redirect_uris: [redirectUri],
        scope: metadataScope,
      },
      stores: persistentOAuthStores,
      requestLock: dbRequestLock,
      actorResolver: new LocalActorResolver({
        handleResolver: new CompositeHandleResolver({
          methods: {
            dns: new NodeDnsHandleResolver(),
            http: new WellKnownHandleResolver(),
          },
        }),
        didDocumentResolver: new CompositeDidDocumentResolver({
          methods: {
            plc: new PlcDidDocumentResolver(),
            web: new WebDidDocumentResolver(),
          },
        }),
      }),
    });
  }

  return new OAuthClient({
    metadata: {
      client_id: `${baseUrl}${routeBase}/metadata.json`,
      redirect_uris: [redirectUri],
      scope: metadataScope,
      jwks_uri: `${baseUrl}/api/auth/atproto/jwks.json`,
    },
    keyset: [getPrivateKey()],
    stores: persistentOAuthStores,
    requestLock: dbRequestLock,
    actorResolver: new LocalActorResolver({
      handleResolver: new CompositeHandleResolver({
        methods: {
          dns: new NodeDnsHandleResolver(),
          http: new WellKnownHandleResolver(),
        },
      }),
      didDocumentResolver: new CompositeDidDocumentResolver({
        methods: {
          plc: new PlcDidDocumentResolver(),
          web: new WebDidDocumentResolver(),
        },
      }),
    }),
  });
}

/**
 * Emit OAuth session lifecycle telemetry. A `deleted` event means atcute
 * dropped the stored session — which is exactly a user getting logged out.
 * After the `requestLock` fix this should only happen on a genuine PDS-side
 * revocation; a recurring stream of these in prod (especially correlated with a
 * deploy) is the signal that refresh rotation is still racing and warrants
 * investigation. This is the primary breadcrumb for the logout-on-deploy bug.
 */
function attachSessionEventLogging(
  client: InstanceType<typeof OAuthClient>,
  kind: AtprotoOAuthClientKind,
): void {
  client.addEventListener((event) => {
    if (event.type === "deleted") {
      logEvent("auth.oauth.session_deleted", {
        client: kind,
        did: event.sub,
        cause:
          event.cause instanceof Error
            ? event.cause.message
            : String(event.cause),
      });
    }
  });
}

function getAtprotoOAuth(
  kind: AtprotoOAuthClientKind = "default",
): InstanceType<typeof OAuthClient> {
  if (kind === "review") {
    if (!_atprotoReviewOAuth) {
      _atprotoReviewOAuth = createOAuthClient("review");
      attachSessionEventLogging(_atprotoReviewOAuth, "review");
    }
    return _atprotoReviewOAuth;
  }

  if (!_atprotoOAuth) {
    _atprotoOAuth = createOAuthClient("default");
    attachSessionEventLogging(_atprotoOAuth, "default");
  }
  return _atprotoOAuth;
}

export const atprotoOAuth = new Proxy({} as InstanceType<typeof OAuthClient>, {
  get(_target, prop) {
    return getAtprotoOAuth()[prop as keyof InstanceType<typeof OAuthClient>];
  },
});

export const atprotoReviewOAuth = new Proxy(
  {} as InstanceType<typeof OAuthClient>,
  {
    get(_target, prop) {
      return getAtprotoOAuth("review")[
        prop as keyof InstanceType<typeof OAuthClient>
      ];
    },
  },
);

export async function restoreAtprotoSession(
  did: Did,
): Promise<Awaited<ReturnType<OAuthClient["restore"]>> | null> {
  for (const kind of ["default", "review"] as const) {
    try {
      const client = getAtprotoOAuth(kind);
      const restored = await client.restore(did);
      if (restored) {
        return restored;
      }
    } catch {
      // Try the next client flavor. The review progressive-auth flow uses a
      // separate OAuth client/metadata endpoint so the default login client
      // metadata stays unchanged.
    }
  }
  return null;
}

export async function revokeAtprotoSession(did: Did): Promise<void> {
  // Evict the 30s cached-client entry for this DID so a request made shortly
  // after this revoke (e.g. the return leg of a revoke + re-authorize upgrade
  // flow) re-resolves from the DB instead of reusing a client bound to the
  // now-revoked session's DPoP key. See restore-client.server.ts.
  const { invalidateAuthenticatedClientCache } =
    await import("./restore-client.server");
  invalidateAuthenticatedClientCache(did);

  let revoked = false;
  let lastError: unknown;

  for (const kind of ["default", "review"] as const) {
    try {
      const client = getAtprotoOAuth(kind);
      await client.revoke(did);
      revoked = true;
    } catch (error) {
      lastError = error;
    }
  }

  if (!revoked && lastError) {
    throw lastError;
  }
}
