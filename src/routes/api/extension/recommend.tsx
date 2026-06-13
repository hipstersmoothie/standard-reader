import { createFileRoute } from "@tanstack/react-router";
import { extensionRecommendDocument } from "#/server/extension/actions.server";
import {
  badRequestResponse,
  getExtensionSession,
  unauthorizedResponse,
} from "#/server/extension/auth.server";

export const Route = createFileRoute("/api/extension/recommend")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getExtensionSession(request);
        if (!session) return unauthorizedResponse();

        let body: { documentUri?: string };
        try {
          body = (await request.json()) as { documentUri?: string };
        } catch {
          return badRequestResponse("invalid JSON body");
        }

        if (!body.documentUri) {
          return badRequestResponse("documentUri required");
        }

        await extensionRecommendDocument(session, body.documentUri, true);
        return Response.json({ ok: true });
      },
      DELETE: async ({ request }) => {
        const session = await getExtensionSession(request);
        if (!session) return unauthorizedResponse();

        const url = new URL(request.url);
        const documentUri = url.searchParams.get("documentUri");
        if (!documentUri) {
          let body: { documentUri?: string } = {};
          try {
            body = (await request.json()) as { documentUri?: string };
          } catch {
            // allow query-only DELETE
          }
          if (!body.documentUri) {
            return badRequestResponse("documentUri required");
          }
          await extensionRecommendDocument(session, body.documentUri, false);
          return Response.json({ ok: true });
        }

        await extensionRecommendDocument(session, documentUri, false);
        return Response.json({ ok: true });
      },
    },
  },
});
