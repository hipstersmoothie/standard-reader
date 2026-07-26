import { randomUUID } from "node:crypto";

import { and, eq, isNull, lt, or } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";

import {
  ACCESS_TOKEN_TTL_MS,
  AUTH_CODE_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
} from "./config";
import { hashToken, randomToken, verifyPkce } from "./crypto";
import { OAuthError } from "./errors";

export interface IssuedTokens {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface GrantSubject {
  userId: string;
  did: string;
  clientId: string;
  scope: string;
  resource: string | null;
}

/** Mint an authorization code bound to a reader, client and PKCE challenge. */
export async function issueAuthorizationCode(input: {
  subject: GrantSubject;
  redirectUri: string;
  codeChallenge: string;
}): Promise<string> {
  const code = randomToken();
  await db.insert(schema.mcpAuthCode).values({
    id: hashToken(code),
    clientId: input.subject.clientId,
    userId: input.subject.userId,
    did: input.subject.did,
    redirectUri: input.redirectUri,
    scope: input.subject.scope,
    codeChallenge: input.codeChallenge,
    resource: input.subject.resource,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });
  return code;
}

/**
 * Redeem an authorization code.
 *
 * The row is deleted as it is read, in one statement, so two concurrent
 * redemptions of the same code can't both succeed — only the request whose
 * DELETE won returns a row.
 */
async function consumeAuthorizationCode(code: string) {
  const [row] = await db
    .delete(schema.mcpAuthCode)
    .where(eq(schema.mcpAuthCode.id, hashToken(code)))
    .returning();
  return row ?? null;
}

async function insertGrant(subject: GrantSubject): Promise<IssuedTokens> {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  const now = Date.now();

  await db.insert(schema.mcpToken).values({
    id: `mcpt_${randomUUID()}`,
    accessTokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    clientId: subject.clientId,
    userId: subject.userId,
    did: subject.did,
    scope: subject.scope,
    resource: subject.resource,
    expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
    refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
  });

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: subject.scope,
  };
}

/** `grant_type=authorization_code`. */
export async function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string | null;
  codeVerifier: string | null;
  resource: string | null;
}): Promise<IssuedTokens> {
  const row = await consumeAuthorizationCode(input.code);
  if (!row) {
    throw new OAuthError(
      "invalid_grant",
      "Authorization code is unknown, already used, or expired.",
    );
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new OAuthError("invalid_grant", "Authorization code has expired.");
  }
  if (row.clientId !== input.clientId) {
    throw new OAuthError(
      "invalid_grant",
      "Authorization code was issued to a different client.",
    );
  }
  if (input.redirectUri !== null && input.redirectUri !== row.redirectUri) {
    throw new OAuthError(
      "invalid_grant",
      "redirect_uri does not match the one used to obtain the code.",
    );
  }
  if (!input.codeVerifier) {
    throw new OAuthError("invalid_request", "`code_verifier` is required.");
  }
  if (!verifyPkce(input.codeVerifier, row.codeChallenge)) {
    throw new OAuthError("invalid_grant", "PKCE verification failed.");
  }
  // A token must never be minted for an audience the reader didn't approve.
  if (
    input.resource !== null &&
    row.resource !== null &&
    input.resource !== row.resource
  ) {
    throw new OAuthError(
      "invalid_target",
      "`resource` does not match the authorization request.",
    );
  }

  return insertGrant({
    userId: row.userId,
    did: row.did,
    clientId: row.clientId,
    scope: row.scope,
    resource: row.resource,
  });
}

/**
 * `grant_type=refresh_token`, with rotation.
 *
 * The old refresh token is cleared in the same statement that reads it, so a
 * stolen-and-replayed refresh token finds nothing. The grant keeps its row, so
 * revoking it from settings still cuts off every descendant token.
 */
export async function refreshGrant(input: {
  refreshToken: string;
  clientId: string;
}): Promise<IssuedTokens> {
  const hash = hashToken(input.refreshToken);
  const row = await db.query.mcpToken.findFirst({
    where: eq(schema.mcpToken.refreshTokenHash, hash),
  });
  if (!row || row.revokedAt !== null) {
    throw new OAuthError(
      "invalid_grant",
      "Refresh token is unknown, already used, or revoked.",
    );
  }
  if (row.clientId !== input.clientId) {
    throw new OAuthError(
      "invalid_grant",
      "Refresh token was issued to a different client.",
    );
  }
  if (row.refreshExpiresAt && row.refreshExpiresAt.getTime() <= Date.now()) {
    throw new OAuthError("invalid_grant", "Refresh token has expired.");
  }

  const accessToken = randomToken();
  const refreshToken = randomToken();
  const now = Date.now();

  const rotated = await db
    .update(schema.mcpToken)
    .set({
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    })
    // Re-assert the old hash so two concurrent refreshes can't both rotate.
    .where(
      and(
        eq(schema.mcpToken.id, row.id),
        eq(schema.mcpToken.refreshTokenHash, hash),
      ),
    )
    .returning({ id: schema.mcpToken.id });

  if (rotated.length === 0) {
    throw new OAuthError(
      "invalid_grant",
      "Refresh token was already redeemed.",
    );
  }

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: row.scope,
  };
}

export interface VerifiedToken {
  grantId: string;
  userId: string;
  did: string;
  clientId: string;
  clientName: string;
  scopes: Array<string>;
}

/** Resolve a presented access token, or `null` when it isn't usable. */
export async function verifyAccessToken(
  token: string,
): Promise<VerifiedToken | null> {
  const row = await db.query.mcpToken.findFirst({
    where: eq(schema.mcpToken.accessTokenHash, hashToken(token)),
    with: { client: true },
  });
  if (!row) return null;
  if (row.revokedAt !== null) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  // Fire-and-forget: last-used powers the settings list, and must not sit on
  // the critical path of every MCP call.
  void db
    .update(schema.mcpToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.mcpToken.id, row.id))
    .catch(() => {});

  return {
    grantId: row.id,
    userId: row.userId,
    did: row.did,
    clientId: row.clientId,
    clientName: row.client?.name ?? row.clientId,
    scopes: row.scope.split(/\s+/).filter(Boolean),
  };
}

/**
 * RFC 7009 revocation. Accepts either token type, and always revokes the whole
 * grant — a client asking to drop its access token means it is done.
 */
export async function revokeToken(input: {
  token: string;
  clientId: string;
}): Promise<void> {
  const hash = hashToken(input.token);
  await db
    .update(schema.mcpToken)
    .set({ revokedAt: new Date(), refreshTokenHash: null })
    .where(
      and(
        eq(schema.mcpToken.clientId, input.clientId),
        isNull(schema.mcpToken.revokedAt),
        or(
          eq(schema.mcpToken.accessTokenHash, hash),
          eq(schema.mcpToken.refreshTokenHash, hash),
        ),
      ),
    );
}

/** Revoke a grant from the app's own UI (settings → connected apps). */
export async function revokeGrantForUser(input: {
  grantId: string;
  userId: string;
}): Promise<void> {
  await db
    .update(schema.mcpToken)
    .set({ revokedAt: new Date(), refreshTokenHash: null })
    .where(
      and(
        eq(schema.mcpToken.id, input.grantId),
        eq(schema.mcpToken.userId, input.userId),
      ),
    );
}

/**
 * Drop expired authorization codes and long-dead grants. Cheap enough to run
 * opportunistically from the token endpoint rather than needing its own cron.
 */
export async function pruneExpired(): Promise<void> {
  const now = new Date();
  await Promise.all([
    db.delete(schema.mcpAuthCode).where(lt(schema.mcpAuthCode.expiresAt, now)),
    db.delete(schema.mcpToken).where(lt(schema.mcpToken.refreshExpiresAt, now)),
  ]);
}
