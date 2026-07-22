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

import { inMemoryRequestLock } from "./request-lock.server";
import { clientMetadataScope } from "./scope";

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
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === "number" || typeof raw === "string") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
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
    // Atomic delete-and-return prevents a TOCTOU race between concurrent
    // requests with the same key.
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

  const entry = await db.query.verification.findFirst({
    where: eq(schema.verification.identifier, identifier),
  });
  if (!entry) return undefined;
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
  // Atomic upsert on the UNIQUE identifier so concurrent writers can't leave
  // duplicate rows or drop a just-written token set.
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
      return getStoreValue<StoredSession>("session", did, consume);
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
      return getStoreValue<StoredState>("state", stateId, consume);
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
      "ATPROTO_PRIVATE_KEY_JWK is required for the confidential OAuth client.",
    );
  }
  const jwk = JSON.parse(keyJson) as ClientAssertionPrivateJwk;
  // The signed client_assertion advertises `kid` in its JWT header; the auth
  // server uses it to find the matching key in our published JWKS.
  if (!jwk.kid) jwk.kid = "standard-writer-oauth";
  return jwk;
}

const ROUTE_BASE = "/api/auth/atproto";

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

function getRedirectUri(): string {
  const normalized = getBaseUrl()
    .replace("localhost", "127.0.0.1")
    .replace(/\/$/, "");
  return `${normalized}${ROUTE_BASE}/callback`;
}

function makeActorResolver(): LocalActorResolver {
  return new LocalActorResolver({
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
  });
}

function createOAuthClient(): InstanceType<typeof OAuthClient> {
  const baseUrl = getBaseUrl();
  const redirectUri = getRedirectUri();

  // Local dev over loopback runs a public client (no keyset / client_id URL);
  // deployed runs a confidential client with a published JWKS.
  if (isPublicClient()) {
    return new OAuthClient({
      metadata: {
        redirect_uris: [redirectUri],
        scope: clientMetadataScope,
      },
      stores: persistentOAuthStores,
      requestLock: inMemoryRequestLock,
      actorResolver: makeActorResolver(),
    });
  }

  return new OAuthClient({
    metadata: {
      client_id: `${baseUrl}${ROUTE_BASE}/metadata.json`,
      redirect_uris: [redirectUri],
      scope: clientMetadataScope,
      jwks_uri: `${baseUrl}${ROUTE_BASE}/jwks.json`,
    },
    keyset: [getPrivateKey()],
    stores: persistentOAuthStores,
    requestLock: inMemoryRequestLock,
    actorResolver: makeActorResolver(),
  });
}

let _atprotoOAuth: InstanceType<typeof OAuthClient> | null = null;

function getAtprotoOAuth(): InstanceType<typeof OAuthClient> {
  _atprotoOAuth ??= createOAuthClient();
  return _atprotoOAuth;
}

/** Lazy singleton — the client is only constructed on first server use. */
export const atprotoOAuth = new Proxy({} as InstanceType<typeof OAuthClient>, {
  get(_target, prop) {
    return getAtprotoOAuth()[prop as keyof InstanceType<typeof OAuthClient>];
  },
});

export async function revokeAtprotoSession(did: Did): Promise<void> {
  try {
    await getAtprotoOAuth().revoke(did);
  } catch {
    // Best-effort: the local session cookie is cleared regardless.
  }
}
