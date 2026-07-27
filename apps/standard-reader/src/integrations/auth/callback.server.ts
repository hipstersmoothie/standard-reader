import { Client } from "@atcute/client";
import type { OAuthClient } from "@atcute/oauth-node-client";
import { redirect } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import { hasEmailScope } from "#/integrations/auth/scope";
import {
  fetchBlueskyPublicProfileFields,
  shouldApplyBlueskyAvatarFromPublicUrl,
} from "#/lib/bluesky-public-profile";
import {
  DEFAULT_AUTH_REDIRECT,
  sanitizeAuthRedirectTarget,
} from "#/utils/auth-redirect";

export async function handleAtprotoOAuthCallback(args: {
  request: Request;
  oauth: Pick<InstanceType<typeof OAuthClient>, "callback">;
}): Promise<Response> {
  const { request, oauth } = args;

  try {
    const callbackUrl = new URL(request.url);
    const callbackError = callbackUrl.searchParams.get("error");
    if (callbackError) {
      console.warn("OAuth callback error param:", callbackError);
    }

    const { session: oauthSession, state } = await oauth.callback(
      callbackUrl.searchParams,
    );

    const did = oauthSession.did;
    // Evict any cached client for this DID so the request that follows this
    // redirect (e.g. the return leg of an upgrade flow) picks up the session
    // just established here rather than a stale one cached moments earlier —
    // see restore-client.server.ts.
    const { invalidateAuthenticatedClientCache } =
      await import("./restore-client.server");
    invalidateAuthenticatedClientCache(did);

    const stateData = state as
      | { redirect?: string; returnTo?: string; handle?: string }
      | undefined;
    const requestedReturnTo = stateData?.redirect ?? stateData?.returnTo;
    const returnTo = sanitizeAuthRedirectTarget(requestedReturnTo, request.url);

    const [publicProfile, existingUserByDid, existingAccount] =
      await Promise.all([
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
      ]);

    let grantedScope: string | null = null;
    try {
      const tokenInfo = await oauthSession.getTokenInfo();
      grantedScope = tokenInfo.scope;
    } catch (error) {
      console.warn("Failed to read OAuth token info on callback:", error);
    }

    // When the reader has granted the `transition:email` scope (weekly-digest
    // opt-in), read their account email from `com.atproto.server.getSession` on
    // the authenticated session so `user.email` stays fresh on every login.
    // Best-effort: never let an email read failure break sign-in.
    let accountEmail: string | null = null;
    let accountEmailConfirmed = false;
    if (hasEmailScope(grantedScope)) {
      try {
        const client = new Client({ handler: oauthSession });
        const res = await client.get("com.atproto.server.getSession", {});
        if (res.ok) {
          const data = res.data as {
            email?: string | null;
            emailConfirmed?: boolean;
          };
          accountEmail = data.email ?? null;
          accountEmailConfirmed = Boolean(data.emailConfirmed);
        }
      } catch (error) {
        console.warn("Failed to read account email on callback:", error);
      }
    }

    const handle = stateData?.handle || publicProfile?.handle || "";
    const displayName = publicProfile?.displayName || handle || did;
    const blueskyAvatarUrl = publicProfile?.avatarUrl ?? null;

    let avatar: string | undefined = blueskyAvatarUrl ?? undefined;
    if (!avatar && existingUserByDid?.image) {
      avatar = existingUserByDid.image;
    } else if (!avatar && existingAccount?.user?.image) {
      avatar = existingAccount.user.image;
    }

    let userId: string;
    let isNewUser = false;

    if (existingUserByDid) {
      userId = existingUserByDid.id;
    } else if (existingAccount) {
      userId = existingAccount.userId;
    } else {
      userId = crypto.randomUUID();
      isNewUser = true;
      await db.insert(schema.user).values({
        id: userId,
        name: displayName,
        did,
        emailVerified: true,
        image: avatar || undefined,
      });
    }

    const priorUser = existingUserByDid ?? existingAccount?.user ?? null;
    if (
      priorUser &&
      blueskyAvatarUrl &&
      shouldApplyBlueskyAvatarFromPublicUrl(priorUser.image, blueskyAvatarUrl)
    ) {
      await db
        .update(schema.user)
        .set({ image: blueskyAvatarUrl })
        .where(eq(schema.user.id, userId));
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

    // Persist the account email (weekly-digest opt-in). Separate best-effort
    // write so a unique-constraint collision or transient failure can't break
    // sign-in — the email is a convenience for the digest, not login state.
    if (accountEmail) {
      try {
        await db
          .update(schema.user)
          .set({ email: accountEmail, emailVerified: accountEmailConfirmed })
          .where(eq(schema.user.id, userId));
      } catch (error) {
        console.warn("Failed to persist account email on callback:", error);
      }
    }

    // One-time digest welcome email. The opt-in flow (`upgradeToWeeklyDigest`)
    // flips `weeklyDigestEnabled` on before this re-auth round-trip, but the
    // reader's email is only readable here — so this callback is the first
    // moment we can both know they enabled the digest AND have somewhere to
    // send. Guarded on a null `weeklyDigestWelcomeSentAt` so it fires exactly
    // once, never on subsequent logins. Best-effort: a failed send leaves the
    // stamp null and retries next login, and never breaks sign-in.
    if (
      accountEmail &&
      priorUser?.weeklyDigestEnabled &&
      !priorUser.weeklyDigestWelcomeSentAt
    ) {
      try {
        const { sendDigestWelcomeEmail } =
          await import("#/server/digest/welcome.server");
        const sent = await sendDigestWelcomeEmail({
          userId,
          email: accountEmail,
          displayName,
        });
        if (sent) {
          await db
            .update(schema.user)
            .set({ weeklyDigestWelcomeSentAt: new Date() })
            .where(eq(schema.user.id, userId));
        }
      } catch (error) {
        console.warn("Failed to send digest welcome email on callback:", error);
      }
    }

    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await db.insert(schema.session).values({
      id: crypto.randomUUID(),
      token: sessionToken,
      userId,
      expiresAt,
      ipAddress: request.headers.get("x-forwarded-for") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
    });

    const isSecure = request.url.startsWith("https://");
    const cookieAttributes = [
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      ...(isSecure ? ["Secure"] : []),
      `Max-Age=${30 * 24 * 60 * 60}`,
    ].join("; ");

    // Brand-new accounts land in the first-run onboarding wizard, but only
    // when they weren't already headed somewhere specific (a subscribe-intent
    // deep link passes an explicit redirect — honor it; the Home gate catches
    // a still-empty account later). Existing users keep their returnTo.
    const effectiveReturnTo =
      isNewUser && returnTo === DEFAULT_AUTH_REDIRECT ? "/welcome" : returnTo;

    const headers = new Headers();
    const baseUrl = new URL(request.url);
    const redirectUrl = effectiveReturnTo.startsWith("http")
      ? new URL(effectiveReturnTo)
      : new URL(effectiveReturnTo, `${baseUrl.protocol}//${baseUrl.host}`);

    redirectUrl.searchParams.set("loginSuccess", "true");
    if (handle) {
      redirectUrl.searchParams.set("handle", handle);
    }
    redirectUrl.searchParams.set("avatar", avatar || "");

    headers.set("Location", redirectUrl.toString());
    headers.append(
      "Set-Cookie",
      `${AUTH_SESSION_TOKEN_COOKIE}=${sessionToken}; ${cookieAttributes}`,
    );

    return new Response(null, {
      status: 302,
      headers,
    });
  } catch (error) {
    console.error("Atproto OAuth callback error:", error);
    throw redirect({
      href: "/login?error=oauth_failed",
    });
  }
}
