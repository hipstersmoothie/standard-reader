import { createFileRoute, redirect } from "@tanstack/react-router";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { atprotoOAuth } from "#/integrations/auth/atproto";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import {
  fetchBlueskyPublicProfileFields,
  shouldApplyBlueskyAvatarFromPublicUrl,
} from "#/lib/bluesky-public-profile";
import { sanitizeAuthRedirectTarget } from "#/utils/auth-redirect";
import { and, eq } from "drizzle-orm";

export const Route = createFileRoute("/api/auth/atproto/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const callbackUrl = new URL(request.url);
          const callbackError = callbackUrl.searchParams.get("error");
          if (callbackError) {
            console.warn("OAuth callback error param:", callbackError);
          }

          const { session: oauthSession, state } = await atprotoOAuth.callback(
            callbackUrl.searchParams,
          );

          const did = oauthSession.did;
          const stateData = state as
            | { redirect?: string; returnTo?: string; handle?: string }
            | undefined;
          const requestedReturnTo = stateData?.redirect ?? stateData?.returnTo;
          const returnTo = sanitizeAuthRedirectTarget(
            requestedReturnTo,
            request.url,
          );

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

          // Snapshot the granted scopes so the UI can detect missing-scope
          // errors (e.g. a collections write attempted without the upgrade).
          // `scope` is only available via `getTokenInfo()` (it's not a sync
          // property on OAuthSession). May differ from what we requested if the
          // user partial-consented.
          let grantedScope: string | null = null;
          try {
            const tokenInfo = await oauthSession.getTokenInfo();
            grantedScope = tokenInfo.scope;
          } catch (error) {
            console.warn("Failed to read OAuth token info on callback:", error);
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

          if (existingUserByDid) {
            userId = existingUserByDid.id;
          } else if (existingAccount) {
            userId = existingAccount.userId;
          } else {
            userId = crypto.randomUUID();
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
            shouldApplyBlueskyAvatarFromPublicUrl(
              priorUser.image,
              blueskyAvatarUrl,
            )
          ) {
            await db
              .update(schema.user)
              .set({ image: blueskyAvatarUrl })
              .where(eq(schema.user.id, userId));
          }

          if (existingAccount) {
            // Refresh the granted-scope snapshot on every callback (covers
            // re-logins where the user upgraded or downgraded their consent).
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
            `Path=/`,
            `HttpOnly`,
            `SameSite=Lax`,
            ...(isSecure ? ["Secure"] : []),
            `Max-Age=${30 * 24 * 60 * 60}`,
          ].join("; ");

          const headers = new Headers();
          const baseUrl = new URL(request.url);
          const redirectUrl = returnTo.startsWith("http")
            ? new URL(returnTo)
            : new URL(returnTo, `${baseUrl.protocol}//${baseUrl.host}`);

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
      },
    },
  },
});
