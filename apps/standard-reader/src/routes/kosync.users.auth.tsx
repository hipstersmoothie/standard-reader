import { createFileRoute } from "@tanstack/react-router";

import { kosyncJson, kosyncReader } from "#/server/kosync/http";

/** "Login" in KOReader's sync settings lands here. */
export const Route = createFileRoute("/kosync/users/auth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reader = await kosyncReader(request);
        if ("response" in reader) return reader.response;
        return kosyncJson({ authorized: "OK" });
      },
    },
  },
});
