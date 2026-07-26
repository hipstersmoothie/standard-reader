import { createFileRoute } from "@tanstack/react-router";

import { corsPreflight, jsonResponse } from "#/server/mcp/oauth/errors";
import { authorizationServerMetadata } from "#/server/mcp/oauth/metadata";

/**
 * RFC 8414 discovery for MCP clients. Reached from the `authorization_servers`
 * entry in the protected-resource document.
 */
export const Route = createFileRoute("/.well-known/oauth-authorization-server")(
  {
    server: {
      handlers: {
        GET: () => jsonResponse(authorizationServerMetadata()),
        OPTIONS: () => corsPreflight(),
      },
    },
  },
);
