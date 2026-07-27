import { createFileRoute } from "@tanstack/react-router";

import { handleRevoke } from "#/server/mcp/oauth/endpoints";
import { corsPreflight } from "#/server/mcp/oauth/errors";

export const Route = createFileRoute("/api/mcp/revoke")({
  server: {
    handlers: {
      POST: ({ request }) => handleRevoke(request),
      OPTIONS: () => corsPreflight(),
    },
  },
});
