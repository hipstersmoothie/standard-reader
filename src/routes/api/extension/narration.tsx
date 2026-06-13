import { createFileRoute } from "@tanstack/react-router";
import { badRequestResponse } from "#/server/extension/auth.server";
import { resolveNarration } from "#/server/extension/narration.server";

export const Route = createFileRoute("/api/extension/narration")({
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

        const narration = await resolveNarration(db, schema, documentUri);
        if (!narration) {
          return Response.json(
            { error: "No narration available" },
            { status: 404 },
          );
        }
        return Response.json(narration);
      },
    },
  },
});
