import { createFileRoute } from "@tanstack/react-router";

import { atprotoOAuth } from "#/integrations/auth/atproto";

export const Route = createFileRoute("/api/auth/atproto/metadata.json")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(atprotoOAuth.metadata), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }),
    },
  },
});
