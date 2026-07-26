import { createFileRoute } from "@tanstack/react-router";

import { corsPreflight, jsonResponse } from "#/server/mcp/oauth/errors";
import { protectedResourceMetadata } from "#/server/mcp/oauth/metadata";

/**
 * RFC 9728 metadata for the `/mcp` resource. The path mirrors the resource's
 * own path, which is what a client derives from the `resource_metadata` URL in
 * our 401 challenge.
 */
export const Route = createFileRoute(
  "/.well-known/oauth-protected-resource/mcp",
)({
  server: {
    handlers: {
      GET: () => jsonResponse(protectedResourceMetadata()),
      OPTIONS: () => corsPreflight(),
    },
  },
});
