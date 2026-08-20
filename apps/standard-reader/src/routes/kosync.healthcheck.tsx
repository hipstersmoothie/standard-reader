import { createFileRoute } from "@tanstack/react-router";

import { kosyncJson } from "#/server/kosync/http";

/** KOReader pings this when the reader taps "Check server". */
export const Route = createFileRoute("/kosync/healthcheck")({
  server: {
    handlers: {
      GET: () => kosyncJson({ state: "OK" }),
    },
  },
});
