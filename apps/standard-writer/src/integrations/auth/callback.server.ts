/**
 * OAuth callback: exchange the code for a session, then mint our own opaque app
 * session (a random token in the shared `session` table) and set the cookie.
 * Upserts the `user` + `account` rows keyed by DID so the account is the same
 * row the reader uses.
 *
 * Two entry points share one `finishLogin`: the plain atproto client
 * (`handleAtprotoOAuthCallback`) and the HappyView-brokered client
 * (`handleHappyViewCallback`). They differ only in how the code is exchanged and
 * how `state` is carried — everything after (session minting, subscribe-with-
 * bluesky, cookie) is identical.
 */

import type { OAuthClient } from "@atcute/oauth-node-client";
import {
  account,
  profiles,
  session as sessionTable,
  user,
} from "@standard-reader/db/schema";
import { redirect } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { getDb } from "../../db/index.server";
import { AUTH_SESSION_TOKEN_COOKIE, SESSION_TTL_MS } from "./constants";
import type { AuthorSession } from "./happyview-oauth.server";

interface StateData {
  redirect?: string;
  handle?: string;
  subscribe?: string;
  email?: string;
}

/**
 * Everything after the code exchange: upsert the account, mint the app session
 * cookie, honor a "subscribe with Bluesky" intent, and 302 home. `session` is
 * the normalized DPoP session for the just-signed-in user (used only for the
 * subscribe write).
 */
async function finishLogin(args: {
  request: Request;
  session: AuthorSession;
  state: StateData | undefined;
}): Promise<Response> {
  const { request, session, state } = args;
  const did = session.did;
  const url = new URL(request.url);

  const db = getDb();
  if (!db) throw new Error("DATABASE_URL is required for authentication.");

  const [profile, existingUser, existingAccount] = await Promise.all([
    db.query.profiles.findFirst({ where: eq(profiles.did, did) }),
    db.query.user.findFirst({ where: eq(user.did, did) }),
    db.query.account.findFirst({
      where: and(eq(account.accountId, did), eq(account.providerId, "atproto")),
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

  // "Subscribe with Bluesky" intent: write the subscriber's own subscription
  // record into the publication's permissioned space. Best-effort — a failure
  // here must not break sign-in; the email path is unaffected.
  if (state?.subscribe && state.email) {
    try {
      const { writeBlueskySubscription } =
        await import("../../server/happyview/subscription-writer.server");
      await writeBlueskySubscription({
        session,
        publicationUri: state.subscribe,
        email: state.email,
      });
    } catch (error) {
      console.error("[standard-writer] bluesky subscribe failed:", error);
    }
  }

  const returnTo =
    state?.redirect && state.redirect.startsWith("/")
      ? state.redirect
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
}

/** Plain atproto OAuth callback (used when HappyView is not configured). */
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
    return await finishLogin({
      request,
      session: {
        did: oauthSession.did,
        handle: (u, init) => oauthSession.handle(u, init),
      },
      state: state as StateData | undefined,
    });
  } catch (error) {
    console.error("Atproto OAuth callback error:", error);
    throw redirect({ href: "/login?error=oauth_failed" });
  }
}

/**
 * HappyView-brokered OAuth callback. The SDK's `callback` returns the DPoP
 * session (its key is HappyView-provisioned) plus the `state` string we passed
 * at authorize time, which we JSON-encoded.
 */
export async function handleHappyViewCallback(args: {
  request: Request;
}): Promise<Response> {
  const { request } = args;
  try {
    const url = new URL(request.url);
    const { getHappyViewOAuth } = await import("./happyview-oauth.server");
    const client = getHappyViewOAuth();
    if (!client) throw new Error("HappyView OAuth is not configured.");
    const { session, state } = await client.callback(url.searchParams);
    const parsed: StateData = state ? JSON.parse(state) : {};
    return await finishLogin({
      request,
      session: {
        did: session.did,
        handle: (u, init) => session.fetchHandler(u, init ?? {}),
      },
      state: parsed,
    });
  } catch (error) {
    console.error("HappyView OAuth callback error:", error);
    throw redirect({ href: "/login?error=oauth_failed" });
  }
}
