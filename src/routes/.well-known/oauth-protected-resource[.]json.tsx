import { createFileRoute } from "@tanstack/react-router";
import { clientMetadataScope } from "#/integrations/auth/scope";
import { getPublicUrl } from "#/lib/public-url";
import { appviewAudience } from "#/server/xrpc/config";

export const Route = createFileRoute(
  "/.well-known/oauth-protected-resource.json",
)({
  server: {
    handlers: {
      GET: () => {
        const resource = appviewAudience();
        const authorizationServer = getPublicUrl();
        const body = {
          resource,
          authorization_servers: [authorizationServer],
          scopes_supported: clientMetadataScope,
          bearer_methods_supported: ["header"],
          resource_signing_alg_values_supported: ["ES256"],
        };
        return new Response(JSON.stringify(body), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
