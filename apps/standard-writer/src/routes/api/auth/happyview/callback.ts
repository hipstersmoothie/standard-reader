import { createFileRoute } from "@tanstack/react-router";

/**
 * HappyView-brokered OAuth redirect target. Only reached when HappyView is
 * configured (the authorize step chose it); exchanges the code via the SDK and
 * mints the app session.
 */
export const Route = createFileRoute("/api/auth/happyview/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleHappyViewCallback } =
          await import("#/integrations/auth/callback.server");
        return handleHappyViewCallback({ request });
      },
    },
  },
});
