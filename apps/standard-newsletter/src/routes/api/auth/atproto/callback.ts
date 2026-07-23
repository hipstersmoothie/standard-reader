import { createFileRoute } from "@tanstack/react-router";

/** OAuth redirect target — exchanges the code and mints the app session. */
export const Route = createFileRoute("/api/auth/atproto/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ handleAtprotoOAuthCallback }, { atprotoOAuth }] =
          await Promise.all([
            import("#/integrations/auth/callback.server"),
            import("#/integrations/auth/atproto.server"),
          ]);
        return handleAtprotoOAuthCallback({ request, oauth: atprotoOAuth });
      },
    },
  },
});
