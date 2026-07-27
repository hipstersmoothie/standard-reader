import { createFileRoute } from "@tanstack/react-router";

import { atprotoReviewOAuth } from "#/integrations/auth/atproto";
import { handleAtprotoOAuthCallback } from "#/integrations/auth/callback.server";

export const Route = createFileRoute("/api/auth/atproto/review/callback")({
  server: {
    handlers: {
      GET: async (ctx: { request: Request }) => {
        return handleAtprotoOAuthCallback({
          request: ctx.request,
          oauth: atprotoReviewOAuth,
        });
      },
    },
  },
});
