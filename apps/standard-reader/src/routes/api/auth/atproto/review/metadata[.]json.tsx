import { createFileRoute } from "@tanstack/react-router";

import { getAtprotoOAuth } from "#/integrations/auth/atproto";

export const Route = createFileRoute("/api/auth/atproto/review/metadata.json")({
  server: {
    handlers: {
      GET: () => {
        const oauth = getAtprotoOAuth("review");
        return new Response(JSON.stringify(oauth.metadata), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
