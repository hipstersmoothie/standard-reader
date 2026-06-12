import { createFileRoute } from "@tanstack/react-router";
import { extensionFollowPublication } from "#/server/extension/actions.server";
import {
  badRequestResponse,
  getExtensionSession,
  unauthorizedResponse,
} from "#/server/extension/auth.server";

export const Route = createFileRoute("/api/extension/follow")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getExtensionSession(request);
        if (!session) return unauthorizedResponse();

        let body: { publicationUri?: string };
        try {
          body = (await request.json()) as { publicationUri?: string };
        } catch {
          return badRequestResponse("invalid JSON body");
        }

        if (!body.publicationUri) {
          return badRequestResponse("publicationUri required");
        }

        const [{ db }, schema] = await Promise.all([
          import("#/db/index.server"),
          import("#/db/schema"),
        ]);
        await extensionFollowPublication(
          session,
          db,
          schema,
          body.publicationUri,
          true,
        );
        return Response.json({ ok: true });
      },
      DELETE: async ({ request }) => {
        const session = await getExtensionSession(request);
        if (!session) return unauthorizedResponse();

        const url = new URL(request.url);
        let publicationUri = url.searchParams.get("publicationUri");
        if (!publicationUri) {
          try {
            const body = (await request.json()) as { publicationUri?: string };
            publicationUri = body.publicationUri ?? null;
          } catch {
            // query-only DELETE
          }
        }

        if (!publicationUri) {
          return badRequestResponse("publicationUri required");
        }

        const [{ db }, schema] = await Promise.all([
          import("#/db/index.server"),
          import("#/db/schema"),
        ]);
        await extensionFollowPublication(
          session,
          db,
          schema,
          publicationUri,
          false,
        );
        return Response.json({ ok: true });
      },
    },
  },
});
