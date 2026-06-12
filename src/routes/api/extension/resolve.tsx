import { createFileRoute } from "@tanstack/react-router";
import {
  badRequestResponse,
  getExtensionSession,
} from "#/server/extension/auth.server";
import {
  resolvePageUrl,
  resolvePageUrls,
} from "#/server/extension/resolve-page-url.server";

export const Route = createFileRoute("/api/extension/resolve")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const single = url.searchParams.get("url");
        const batch = url.searchParams.get("urls");

        if (!single && !batch) {
          return badRequestResponse("url or urls query param required");
        }

        const [{ db }, schema] = await Promise.all([
          import("#/db/index.server"),
          import("#/db/schema"),
        ]);
        const session = await getExtensionSession(request);

        if (batch) {
          const urls = batch
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
          if (urls.length === 0) {
            return badRequestResponse("urls must not be empty");
          }
          const results = await resolvePageUrls(db, schema, urls, session);
          return Response.json({ results });
        }

        if (!single) {
          return badRequestResponse("url query param required");
        }

        const pageHints = {
          documentUri: url.searchParams.get("documentUri"),
          publicationUri: url.searchParams.get("publicationUri"),
        };

        const result = await resolvePageUrl(
          db,
          schema,
          single,
          session,
          pageHints,
        );
        return Response.json(result);
      },
    },
  },
});
