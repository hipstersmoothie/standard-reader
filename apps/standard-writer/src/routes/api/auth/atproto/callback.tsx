import { createFileRoute } from "@tanstack/react-router";

import { atprotoOAuth } from "#/integrations/auth/atproto";
import { handleAtprotoOAuthCallback } from "#/integrations/auth/callback.server";

export const Route = createFileRoute("/api/auth/atproto/callback")({
  server: {
    handlers: {
      GET: (ctx: { request: Request }) =>
        handleAtprotoOAuthCallback({
          request: ctx.request,
          oauth: atprotoOAuth,
        }),
    },
  },
});
