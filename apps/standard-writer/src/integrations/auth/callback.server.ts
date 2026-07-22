import type { OAuthClient } from "@atcute/oauth-node-client";
import { redirect } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import { sanitizeAuthRedirectTarget } from "#/utils/auth-redirect";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Handle the OAuth redirect: exchange the code for a session, upsert the
 * `user` + `account` rows (shared identity tables), mint an opaque app session,
 * set the HttpOnly cookie, and bounce back to where the writer started.
 */
export async function handleAtprotoOAuthCallback(args: {
  request: Request;
  oauth: Pick<InstanceType<typeof OAuthClient>, "callback">;
}): Promise<Response> {
  const { request, oauth } = args;

  try {
    const callbackUrl = new URL(request.url);
    const { session: oauthSession, state } = await oauth.callback(
      callbackUrl.searchParams,
    );
    const did = oauthSession.did;

    const stateData = state as
      | { redirect?: string; handle?: string }
      | undefined;
    const returnTo = sanitizeAuthRedirectTarget(
      stateData?.redirect,
      request.url,
    );
    const handle = stateData?.handle || "";
    const displayName = handle || did;

    let grantedScope: string | null = null;
    try {
      const tokenInfo = await oauthSession.getTokenInfo();
      grantedScope = tokenInfo.scope;
    } catch {
      // Scope is a convenience record; never let it break sign-in.
    }

    const [existingUser, existingAccount] = await Promise.all([
      db.query.user.findFirst({ where: eq(schema.user.did, did) }),
      db.query.account.findFirst({
        where: and(
          eq(schema.account.accountId, did),
          eq(schema.account.providerId, "atproto"),
        ),
      }),
    ]);

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
    } else if (existingAccount) {
      userId = existingAccount.userId;
    } else {
      userId = crypto.randomUUID();
      await db.insert(schema.user).values({
        id: userId,
        name: displayName,
        did,
        emailVerified: true,
      });
    }

    if (existingAccount) {
      await db
        .update(schema.account)
        .set({ scope: grantedScope })
        .where(eq(schema.account.id, existingAccount.id));
    } else {
      await db.insert(schema.account).values({
        id: crypto.randomUUID(),
        accountId: did,
        providerId: "atproto",
        userId,
        scope: grantedScope,
      });
    }

    const sessionToken = crypto.randomUUID();
    await db.insert(schema.session).values({
      id: crypto.randomUUID(),
      token: sessionToken,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ipAddress: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    });

    const isSecure = request.url.startsWith("https://");
    const cookie = [
      `${AUTH_SESSION_TOKEN_COOKIE}=${sessionToken}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      ...(isSecure ? ["Secure"] : []),
      `Max-Age=${SESSION_TTL_MS / 1000}`,
    ].join("; ");

    const headers = new Headers();
    const base = new URL(request.url);
    const location = returnTo.startsWith("http")
      ? new URL(returnTo)
      : new URL(returnTo, `${base.protocol}//${base.host}`);
    headers.set("Location", location.toString());
    headers.append("Set-Cookie", cookie);

    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("Atproto OAuth callback error:", error);
    throw redirect({ href: "/login?error=oauth_failed" });
  }
}
