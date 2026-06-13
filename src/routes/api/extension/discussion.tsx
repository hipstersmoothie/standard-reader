import { createFileRoute } from "@tanstack/react-router";
import { badRequestResponse } from "#/server/extension/auth.server";
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

        const [{ db }, schema] = await Promise.all([
          import("#/db/index.server"),
          import("#/db/schema"),
        ]);

        const discussion = await resolveDiscussion(db, schema, documentUri);
        return Response.json(discussion);
      },
    },
  },
});
