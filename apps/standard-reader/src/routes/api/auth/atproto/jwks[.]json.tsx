import { createFileRoute } from "@tanstack/react-router";

import { atprotoOAuth } from "#/integrations/auth/atproto";

export const Route = createFileRoute("/api/auth/atproto/jwks.json")({
  server: {
    handlers: {
      GET: () => {
        return new Response(JSON.stringify(atprotoOAuth.jwks), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
