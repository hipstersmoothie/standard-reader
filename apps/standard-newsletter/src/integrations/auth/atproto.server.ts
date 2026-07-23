/**
 * AT Protocol OAuth client for the newsletter, mirroring the reader's setup with
 * @atcute/oauth-node-client: a confidential client (client_assertion signed with
 * ATPROTO_PRIVATE_KEY_JWK) in prod, a public client on localhost. Pre-flow state
 * and post-flow sessions persist in the shared `verification` table (KV), so a
 * user is the same account across both apps. Identity is only used to establish
 * who is signed in — reads come from our own DB, so the requested scope is just
 * `atproto`.
 */

import {
  CompositeDidDocumentResolver,
  CompositeHandleResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  WebDidDocumentResolver,
  WellKnownHandleResolver,
} from "@atcute/identity-resolver";
import { NodeDnsHandleResolver } from "@atcute/identity-resolver-node";
import type {
  ClientAssertionPrivateJwk,
  OAuthClientStores,
  StoredSession,
  StoredState,
} from "@atcute/oauth-node-client";
import { OAuthClient } from "@atcute/oauth-node-client";
import { verification } from "@standard-reader/db/schema";
import { eq, like } from "drizzle-orm";

import { getDb } from "../../db/index.server";
import { getPublicUrl } from "../../lib/public-url";
import { requestLock } from "./request-lock.server";

const STORE_PREFIX = "newsletter-oauth";
const STATE_TTL_MS = 15 * 60_000;
const SESSION_TTL_MS = 180 * 24 * 60 * 60_000;
const ROUTE_BASE = "/api/auth/atproto";
const SCOPE = ["atproto"];

type StoreKind = "session" | "state";

function requireDb() {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required for authentication.");
  return db;
}

function storeId(kind: StoreKind, key: string): string {
  return `${STORE_PREFIX}:${kind}:${key}`;
}

function parse<T>(value: string): T | undefined {
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function sessionExpiry(session: StoredSession): Date {
  const raw = (session as unknown as Record<string, unknown>).expiresAt;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw === "number" || typeof raw === "string") {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(Date.now() + SESSION_TTL_MS);
}

async function getValue<T>(
  kind: StoreKind,
  key: string,
  consume: boolean,
): Promise<T | undefined> {
  const db = requireDb();
  const identifier = storeId(kind, key);
  if (consume) {
    const [deleted] = await db
      .delete(verification)
      .where(eq(verification.identifier, identifier))
      .returning({
        value: verification.value,
        expiresAt: verification.expiresAt,
      });
    if (!deleted || deleted.expiresAt.getTime() <= Date.now()) return undefined;
    return parse<T>(deleted.value);
  }
  const entry = await db.query.verification.findFirst({
    where: eq(verification.identifier, identifier),
  });
  if (!entry) return undefined;
  if (entry.expiresAt.getTime() <= Date.now()) {
    await db
      .delete(verification)
      .where(eq(verification.identifier, identifier));
    return undefined;
  }
  return parse<T>(entry.value);
}

async function setValue<T>(
  kind: StoreKind,
  key: string,
  value: T,
  expiresAt: Date,
): Promise<void> {
  const db = requireDb();
  const identifier = storeId(kind, key);
  await db
    .insert(verification)
    .values({
      id: crypto.randomUUID(),
      identifier,
      value: JSON.stringify(value),
      expiresAt,
    })
    .onConflictDoUpdate({
      target: verification.identifier,
      set: { value: JSON.stringify(value), expiresAt, updatedAt: new Date() },
    });
}

async function deleteValue(kind: StoreKind, key: string): Promise<void> {
  await requireDb()
    .delete(verification)
    .where(eq(verification.identifier, storeId(kind, key)));
}

async function clearValues(kind: StoreKind): Promise<void> {
  await requireDb()
    .delete(verification)
    .where(like(verification.identifier, `${STORE_PREFIX}:${kind}:%`));
}

const stores: OAuthClientStores = {
  sessions: {
    async get(did, options) {
      const consume =
        (options as { consume?: boolean } | undefined)?.consume === true;
      return await getValue<StoredSession>("session", did, consume);
    },
    async set(did, session) {
      await setValue("session", did, session, sessionExpiry(session));
    },
    async delete(did) {
      await deleteValue("session", did);
    },
    async clear() {
      await clearValues("session");
    },
  },
  states: {
    async get(stateId, options) {
      const consume =
        (options as { consume?: boolean } | undefined)?.consume === true;
      return await getValue<StoredState>("state", stateId, consume);
    },
    async set(stateId, state) {
      await setValue(
        "state",
        stateId,
        state,
        new Date(Date.now() + STATE_TTL_MS),
      );
    },
    async delete(stateId) {
      await deleteValue("state", stateId);
    },
    async clear() {
      await clearValues("state");
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
  if (!jwk.kid) jwk.kid = "standard-newsletter-oauth";
  return jwk;
}

function actorResolver() {
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

function baseUrl(): string {
  return getPublicUrl();
}

function redirectUri(): string {
  return `${baseUrl().replace("localhost", "127.0.0.1").replace(/\/$/, "")}${ROUTE_BASE}/callback`;
}

function isPublicClient(): boolean {
  const b = baseUrl();
  return b.startsWith("http://localhost") || b.startsWith("http://127.0.0.1");
}

let _client: InstanceType<typeof OAuthClient> | null = null;

function createClient(): InstanceType<typeof OAuthClient> {
  if (isPublicClient()) {
    return new OAuthClient({
      metadata: { redirect_uris: [redirectUri()], scope: SCOPE },
      stores,
      requestLock,
      actorResolver: actorResolver(),
    });
  }
  const b = baseUrl();
  return new OAuthClient({
    metadata: {
      client_id: `${b}${ROUTE_BASE}/metadata.json`,
      redirect_uris: [redirectUri()],
      scope: SCOPE,
      jwks_uri: `${b}${ROUTE_BASE}/jwks.json`,
    },
    keyset: [getPrivateKey()],
    stores,
    requestLock,
    actorResolver: actorResolver(),
  });
}

export const atprotoOAuth = new Proxy({} as InstanceType<typeof OAuthClient>, {
  get(_t, prop) {
    _client ??= createClient();
    return _client[prop as keyof InstanceType<typeof OAuthClient>];
  },
});
