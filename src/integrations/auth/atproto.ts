import type { Did } from "@atcute/lexicons";
import type {
  ClientAssertionPrivateJwk,
  OAuthClientStores,
  StoredSession,
  StoredState,
} from "@atcute/oauth-node-client";

import {
  CompositeDidDocumentResolver,
  CompositeHandleResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  WellKnownHandleResolver,
} from "@atcute/identity-resolver";
import { NodeDnsHandleResolver } from "@atcute/identity-resolver-node";
import { OAuthClient } from "@atcute/oauth-node-client";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { eq, like } from "drizzle-orm";

import { scope } from "./scope";

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

  if (consume) {
    await db
      .delete(schema.verification)
      .where(eq(schema.verification.identifier, identifier));
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
  await db
    .delete(schema.verification)
    .where(eq(schema.verification.identifier, identifier));
  await db.insert(schema.verification).values({
    id: crypto.randomUUID(),
    identifier,
    value: JSON.stringify(value),
    expiresAt,
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
  return JSON.parse(keyJson) as ClientAssertionPrivateJwk;
}

function getBaseUrl(): string {
  const url =
    process.env.PUBLIC_URL ||
    process.env.BETTER_AUTH_URL ||
    process.env.ATPROTO_BASE_URL;
  if (!url) {
    throw new Error(
      "PUBLIC_URL (or BETTER_AUTH_URL / ATPROTO_BASE_URL) environment variable is required",
    );
  }
  return url.replace(/\/$/, "");
}

function isPublicClient(): boolean {
  const baseUrl = getBaseUrl();
  return (
    baseUrl.startsWith("http://localhost") ||
    baseUrl.startsWith("http://127.0.0.1")
  );
}

function getRedirectUri(): string {
  const baseUrl = getBaseUrl();
  if (isPublicClient()) {
    return (
      baseUrl.replace("localhost", "127.0.0.1").replace(/\/$/, "") +
      "/api/auth/atproto/callback"
    );
  }
  return `${baseUrl}/api/auth/atproto/callback`;
}

let _atprotoOAuth: InstanceType<typeof OAuthClient> | null = null;

function getAtprotoOAuth(): InstanceType<typeof OAuthClient> {
  if (!_atprotoOAuth) {
    const baseUrl = getBaseUrl();
    const redirectUri = getRedirectUri();
    const isPublic = isPublicClient();

    if (isPublic) {
      _atprotoOAuth = new OAuthClient({
        metadata: {
          redirect_uris: [redirectUri],
          scope,
        },
        stores: persistentOAuthStores,
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
    } else {
      _atprotoOAuth = new OAuthClient({
        metadata: {
          client_id: `${baseUrl}/api/auth/atproto/metadata.json`,
          redirect_uris: [redirectUri],
          scope,
          jwks_uri: `${baseUrl}/api/auth/atproto/jwks.json`,
        },
        keyset: [getPrivateKey()],
        stores: persistentOAuthStores,
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
  }
  return _atprotoOAuth;
}

export const atprotoOAuth = new Proxy({} as InstanceType<typeof OAuthClient>, {
  get(_target, prop) {
    return getAtprotoOAuth()[prop as keyof InstanceType<typeof OAuthClient>];
  },
});

export async function restoreAtprotoSession(
  did: Did,
): Promise<Awaited<ReturnType<OAuthClient["restore"]>> | null> {
  try {
    const client = getAtprotoOAuth();
    return await client.restore(did);
  } catch {
    return null;
  }
}

export async function revokeAtprotoSession(did: Did): Promise<void> {
  const client = getAtprotoOAuth();
  await client.revoke(did);
}
