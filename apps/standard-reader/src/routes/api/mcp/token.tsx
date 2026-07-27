import { createFileRoute } from "@tanstack/react-router";

import { handleToken } from "#/server/mcp/oauth/endpoints";
import { corsPreflight } from "#/server/mcp/oauth/errors";

export const Route = createFileRoute("/api/mcp/token")({
  server: {
    handlers: {
      POST: ({ request }) => handleToken(request),
      OPTIONS: () => corsPreflight(),
    },
  },
});
