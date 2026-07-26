import { createFileRoute } from "@tanstack/react-router";

import { handleRegister } from "#/server/mcp/oauth/endpoints";
import { corsPreflight } from "#/server/mcp/oauth/errors";

export const Route = createFileRoute("/api/mcp/register")({
  server: {
    handlers: {
      POST: ({ request }) => handleRegister(request),
      OPTIONS: () => corsPreflight(),
    },
  },
});
