import { createFileRoute } from "@tanstack/react-router";
import { dispatchXrpc } from "#/server/xrpc/dispatch";

export const Route = createFileRoute("/xrpc/$")({
  server: {
    handlers: {
      GET: ({ request }) => dispatchXrpc(request),
      POST: ({ request }) => dispatchXrpc(request),
      OPTIONS: ({ request }) => dispatchXrpc(request),
    },
  },
});
