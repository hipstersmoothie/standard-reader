import type { ActorIdentifier } from "@atcute/lexicons";
import { createFileRoute } from "@tanstack/react-router";

/**
 * Start login: `/api/auth/atproto/authorize?handle=<handle>&redirect=<path>`.
 * Resolves the handle, pushes the PAR request, and 302s to the PDS's authorize
 * UI. Missing handle → back to the login form.
 */
export const Route = createFileRoute("/api/auth/atproto/authorize")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const handle = url.searchParams.get("handle")?.trim();
        // Optional "subscribe with Bluesky" intent: after auth the callback
        // writes a subscription record into the subscriber's own space repo.
        const subscribe = url.searchParams.get("subscribe") ?? undefined;
        const email = url.searchParams.get("email") ?? undefined;
        const redirectParam =
          url.searchParams.get("redirect") ?? (subscribe ? "/" : "/dashboard");
        if (!handle) {
          return Response.redirect(
            new URL("/login", url.origin).toString(),
            302,
          );
        }

        const state = { redirect: redirectParam, handle, subscribe, email };

        // When HappyView is configured, broker sign-in through it so the
        // session's DPoP key is one HappyView provisioned (required for space
        // writes). Otherwise use the plain atproto client.
        const { getHappyViewOAuth } =
          await import("#/integrations/auth/happyview-oauth.server");
        const hv = getHappyViewOAuth();
        if (hv) {
          const { OAUTH_SCOPE } =
            await import("#/integrations/auth/atproto.server");
          const authUrl = await hv.authorize(handle, {
            scope: OAUTH_SCOPE,
            state: JSON.stringify(state),
          });
          return Response.redirect(authUrl.toString(), 302);
        }

        const { atprotoOAuth, OAUTH_SCOPE } =
          await import("#/integrations/auth/atproto.server");
        const { url: authUrl } = await atprotoOAuth.authorize({
          target: { type: "account", identifier: handle as ActorIdentifier },
          scope: OAUTH_SCOPE,
          state,
        });
        return Response.redirect(authUrl.toString(), 302);
      },
    },
  },
});
