import { createFileRoute } from "@tanstack/react-router";

import { atprotoReviewOAuth } from "#/integrations/auth/atproto";

export const Route = createFileRoute("/api/auth/atproto/review/metadata.json")({
  server: {
    handlers: {
      GET: () => {
        return new Response(JSON.stringify(atprotoReviewOAuth.metadata), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
