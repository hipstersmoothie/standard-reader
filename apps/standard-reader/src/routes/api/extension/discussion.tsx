import { createFileRoute } from "@tanstack/react-router";

import {
  badRequestResponse,
  getExtensionSession,
} from "#/server/extension/auth.server";
import { resolveDiscussion } from "#/server/extension/discussion.server";

export const Route = createFileRoute("/api/extension/discussion")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const documentUri = url.searchParams.get("documentUri");
        if (!documentUri) {
          return badRequestResponse("documentUri query param required");
        }

        const [{ db }, schema, { resolveReaderSessionPreferences }] =
          await Promise.all([
            import("#/db/index.server"),
            import("#/db/schema"),
            import("#/server/reader/session-preferences.server"),
          ]);

        const [{ excludeWebBridgeEnabled }, session] = await Promise.all([
          resolveReaderSessionPreferences(db, schema),
          getExtensionSession(request),
        ]);
        const discussion = await resolveDiscussion(db, schema, documentUri, {
          excludeWebBridge: excludeWebBridgeEnabled,
          viewerDid: session?.did,
        });
        return Response.json(discussion);
      },
    },
  },
});
