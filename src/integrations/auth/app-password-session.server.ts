/**
 * Dev/perf-only AT Proto sessions via Bluesky app password (`PasswordSession`).
 * Gated by `PERF_TEST_APP_PASSWORD` on the server — never set in production.
 */
import type { Did } from "@atcute/lexicons";
import type { PasswordSessionData } from "@atcute/password-session";

import { isDid } from "@atcute/lexicons/syntax";
import { PasswordSession } from "@atcute/password-session";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { fetchBlueskyPublicProfileFields } from "#/lib/bluesky-public-profile";
import { and, eq } from "drizzle-orm";

const APP_PASSWORD_STORE_PREFIX = "atproto-apppass:session:";
const DEFAULT_PDS = "https://bsky.social";
const APP_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ATP_SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function storeIdentifier(did: Did): string {
  return `${APP_PASSWORD_STORE_PREFIX}${did}`;
}

export function isAppPasswordAuthEnabled(): boolean {
  return Boolean(process.env.PERF_TEST_APP_PASSWORD?.trim());
}

function perfPdsService(): string {
  return process.env.PERF_TEST_PDS_URL?.trim() || DEFAULT_PDS;
}

function parseStoredSession(value: string): PasswordSessionData | undefined {
  try {
    const parsed = JSON.parse(value) as PasswordSessionData;
    if (!parsed?.did || !isDid(parsed.did)) return undefined;
    if (!parsed.accessJwt || !parsed.refreshJwt) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function storeAppPasswordSession(
  session: PasswordSessionData,
): Promise<void> {
  const identifier = storeIdentifier(session.did);
  const expiresAt = new Date(Date.now() + ATP_SESSION_TTL_MS);

  await db
    .delete(schema.verification)
    .where(eq(schema.verification.identifier, identifier));
  await db.insert(schema.verification).values({
    id: crypto.randomUUID(),
    identifier,
    value: JSON.stringify(session),
    expiresAt,
  });
}

export async function restoreAppPasswordClient(
  did: Did,
): Promise<PasswordSession | null> {
  if (!isAppPasswordAuthEnabled()) {
    return null;
  }

  const identifier = storeIdentifier(did);
  const entry = await db.query.verification.findFirst({
    where: eq(schema.verification.identifier, identifier),
  });

  if (!entry || entry.expiresAt.getTime() <= Date.now()) {
    if (entry) {
      await db
        .delete(schema.verification)
        .where(eq(schema.verification.identifier, identifier));
    }
    return null;
  }

  const stored = parseStoredSession(entry.value);
  if (!stored) {
    await db
      .delete(schema.verification)
      .where(eq(schema.verification.identifier, identifier));
    return null;
  }

  try {
    const session = await PasswordSession.resume(stored);
    return session;
  } catch {
    await db
      .delete(schema.verification)
      .where(eq(schema.verification.identifier, identifier));
    return null;
  }
}

async function ensureUserForDid(did: Did, handle: string): Promise<string> {
  const [publicProfile, existingUserByDid, existingAccount] = await Promise.all(
    [
      fetchBlueskyPublicProfileFields(did),
      db.query.user.findFirst({
        where: eq(schema.user.did, did),
      }),
      db.query.account.findFirst({
        where: and(
          eq(schema.account.accountId, did),
          eq(schema.account.providerId, "atproto"),
        ),
        with: { user: true },
      }),
    ],
  );

  const resolvedHandle = handle || publicProfile?.handle || "";
  const displayName = publicProfile?.displayName || resolvedHandle || did;
  const avatar = publicProfile?.avatarUrl ?? undefined;

  if (existingUserByDid) {
    return existingUserByDid.id;
  }

  if (existingAccount) {
    return existingAccount.userId;
  }

  const userId = crypto.randomUUID();
  await db.insert(schema.user).values({
    id: userId,
    name: displayName,
    did,
    emailVerified: true,
    image: avatar,
  });
  await db.insert(schema.account).values({
    id: crypto.randomUUID(),
    accountId: did,
    providerId: "atproto",
    userId,
  });

  return userId;
}

async function createAppSessionToken(userId: string): Promise<string> {
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + APP_SESSION_TTL_MS);

  await db.insert(schema.session).values({
    id: crypto.randomUUID(),
    token: sessionToken,
    userId,
    expiresAt,
    userAgent: "perf-regression",
  });

  return sessionToken;
}

/** Log in with app password and return an HttpOnly session token for perf tests. */
export async function bootstrapAppPasswordSession(
  identifier: string,
  password: string,
): Promise<{ sessionToken: string; did: Did }> {
  const session = await PasswordSession.login({
    service: perfPdsService(),
    identifier,
    password,
  });
  await storeAppPasswordSession(session.session);

  const userId = await ensureUserForDid(session.did, session.session.handle);
  const sessionToken = await createAppSessionToken(userId);

  return { sessionToken, did: session.did };
}
