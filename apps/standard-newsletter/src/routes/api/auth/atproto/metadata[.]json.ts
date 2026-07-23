import { createFileRoute } from "@tanstack/react-router";

/** The OAuth client_id document the authorization server fetches. */
export const Route = createFileRoute("/api/auth/atproto/metadata.json")({
  server: {
    handlers: {
      GET: async () => {
        const { atprotoOAuth } = await import(
          "#/integrations/auth/atproto.server"
        );
        return Response.json(atprotoOAuth.metadata, {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      },
    },
  },
});
