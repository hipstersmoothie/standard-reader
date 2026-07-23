import { createFileRoute } from "@tanstack/react-router";

/** Public JWKS for the confidential client's client_assertion signing key. */
export const Route = createFileRoute("/api/auth/atproto/jwks.json")({
  server: {
    handlers: {
      GET: async () => {
        const { atprotoOAuth } = await import(
          "#/integrations/auth/atproto.server"
        );
        return Response.json(atprotoOAuth.jwks, {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      },
    },
  },
});
