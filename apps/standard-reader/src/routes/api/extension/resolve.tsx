import { createFileRoute } from "@tanstack/react-router";

import {
  badRequestResponse,
  getExtensionOpenLinksExternally,
  getExtensionSession,
} from "#/server/extension/auth.server";
import { withExplicitReaderView } from "#/server/extension/reader-view";
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
        // Article URLs carry `?view=reader` for readers who open links on the
        // original site (see `withExplicitReaderView`). A primary-key read,
        // run alongside the resolve rather than after it.
        const loadOpenLinksExternally = () =>
          getExtensionOpenLinksExternally(db, schema, session, request);

        if (batch) {
          const urls = batch
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
          if (urls.length === 0) {
            return badRequestResponse("urls must not be empty");
          }
          const [results, openLinksExternally] = await Promise.all([
            resolvePageUrls(db, schema, urls, session),
            loadOpenLinksExternally(),
          ]);
          return Response.json({
            results: Object.fromEntries(
              Object.entries(results).map(([key, result]) => [
                key,
                withExplicitReaderView(result, openLinksExternally),
              ]),
            ),
          });
        }

        if (!single) {
          return badRequestResponse("url query param required");
        }

        const pageHints = {
          documentUri: url.searchParams.get("documentUri"),
          publicationUri: url.searchParams.get("publicationUri"),
        };

        const [result, openLinksExternally] = await Promise.all([
          resolvePageUrl(db, schema, single, session, pageHints),
          loadOpenLinksExternally(),
        ]);
        return Response.json(
          withExplicitReaderView(result, openLinksExternally),
        );
      },
    },
  },
});
