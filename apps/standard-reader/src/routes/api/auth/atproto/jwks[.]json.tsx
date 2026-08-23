import { createFileRoute } from "@tanstack/react-router";

import { getAtprotoOAuth } from "#/integrations/auth/atproto";

export const Route = createFileRoute("/api/auth/atproto/jwks.json")({
  server: {
    handlers: {
      GET: () => {
        return new Response(JSON.stringify(getAtprotoOAuth().jwks), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
