import { createFileRoute } from "@tanstack/react-router";

/**
 * Native unsubscribe for a signed-in Bluesky subscriber: deletes their own
 * subscription record from their space repo (and flips the mirror). The
 * subscriber must be the authenticated caller.
 * POST { publicationUri }.
 */
export const Route = createFileRoute("/api/subscription/unsubscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getCurrentUserDid } =
          await import("#/integrations/auth/session.server");
        const viewerDid = await getCurrentUserDid(request);
        if (!viewerDid) {
          return Response.json(
            { ok: false, error: "unauthenticated" },
            {
              status: 401,
            },
          );
        }

        let body: { publicationUri?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json(
            { ok: false, error: "invalid-json" },
            {
              status: 400,
            },
          );
        }
        const publicationUri =
          typeof body.publicationUri === "string" ? body.publicationUri : "";
        if (!publicationUri) {
          return Response.json(
            { ok: false, error: "missing-fields" },
            {
              status: 400,
            },
          );
        }

        const { unsubscribeMine } =
          await import("#/server/subscriptions.server");
        const ok = await unsubscribeMine(viewerDid, publicationUri);
        return Response.json({ ok }, { status: ok ? 200 : 400 });
      },
    },
  },
});
