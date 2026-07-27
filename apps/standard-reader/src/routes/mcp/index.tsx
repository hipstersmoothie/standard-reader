import { createFileRoute } from "@tanstack/react-router";

import { handleMcpRequest } from "#/server/mcp/handler";

/**
 * The remote MCP endpoint: `https://standard-reader.app/mcp`.
 *
 * Paste that URL into any MCP client. The 401 it gets back carries the
 * `resource_metadata` pointer that starts OAuth discovery — see
 * `src/server/mcp/handler.ts`.
 */
export const Route = createFileRoute("/mcp/")({
  server: {
    handlers: {
      POST: ({ request }) => handleMcpRequest(request),
      GET: ({ request }) => handleMcpRequest(request),
      DELETE: ({ request }) => handleMcpRequest(request),
      OPTIONS: ({ request }) => handleMcpRequest(request),
    },
  },
});
