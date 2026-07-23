/**
 * OAuth callback: exchange the code for an atcute session, then mint our own
 * opaque app session (a random token in the shared `session` table) and set the
 * cookie. Upserts the `user` + `account` rows keyed by DID so the account is the
 * same row the reader uses. Trimmed vs. the reader (no email scope / digest
 * welcome — the newsletter doesn't need them).
 */

import type { OAuthClient } from "@atcute/oauth-node-client";
import { redirect } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import {
  account,
  profiles,
  session as sessionTable,
  user,
} from "@standard-reader/db/schema";

import { getDb } from "../../db/index.server";
import { AUTH_SESSION_TOKEN_COOKIE, SESSION_TTL_MS } from "./constants";

export async function handleAtprotoOAuthCallback(args: {
  request: Request;
  oauth: Pick<InstanceType<typeof OAuthClient>, "callback">;
}): Promise<Response> {
  const { request, oauth } = args;
  try {
    const url = new URL(request.url);
    const { session: oauthSession, state } = await oauth.callback(
      url.searchParams,
    );
    const did = oauthSession.did;

    const db = getDb();
    if (!db) throw new Error("DATABASE_URL is required for authentication.");

    const [profile, existingUser, existingAccount] = await Promise.all([
      db.query.profiles.findFirst({ where: eq(profiles.did, did) }),
      db.query.user.findFirst({ where: eq(user.did, did) }),
      db.query.account.findFirst({
        where: and(
          eq(account.accountId, did),
          eq(account.providerId, "atproto"),
        ),
      }),
    ]);

    const displayName = profile?.displayName || profile?.handle || did;
    const image = profile?.avatarUrl ?? undefined;

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
    } else if (existingAccount) {
      userId = existingAccount.userId;
    } else {
      userId = crypto.randomUUID();
      await db.insert(user).values({
        id: userId,
        name: displayName,
        did,
        emailVerified: false,
        image,
      });
    }

    if (!existingAccount) {
      await db.insert(account).values({
        id: crypto.randomUUID(),
        accountId: did,
        providerId: "atproto",
        userId,
        scope: "atproto",
      });
    }

    const token = crypto.randomUUID();
    await db.insert(sessionTable).values({
      id: crypto.randomUUID(),
      token,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ipAddress: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    });

    const stateData = state as { redirect?: string } | undefined;
    const returnTo =
      stateData?.redirect && stateData.redirect.startsWith("/")
        ? stateData.redirect
        : "/dashboard";

    const isSecure = request.url.startsWith("https://");
    const cookie = [
      `${AUTH_SESSION_TOKEN_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      ...(isSecure ? ["Secure"] : []),
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ].join("; ");

    const headers = new Headers();
    headers.set("Location", new URL(returnTo, url.origin).toString());
    headers.append("Set-Cookie", cookie);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("Atproto OAuth callback error:", error);
    throw redirect({ href: "/login?error=oauth_failed" });
  }
}
