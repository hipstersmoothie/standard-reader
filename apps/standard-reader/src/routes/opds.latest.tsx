import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { opdsFormatFromRequest, opdsResponse } from "#/lib/opds/respond";
import { opdsLatestUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { SITE_NAME } from "#/lib/site-metadata";
import {
  articleFeed,
  OPDS_PAGE_SIZE,
  pageFromRequest,
} from "#/server/opds/catalog";
import { selectArticleCards } from "#/server/reader/queries";

export const Route = createFileRoute("/opds/latest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = getPublicUrl();
        const page = pageFromRequest(request);

        // Only what a reader can actually take: a catalog entry with no
        // acquisition link is a download button that does nothing.
        const cards = await selectArticleCards(db, schema, {
          discoverOnly: true,
          limit: OPDS_PAGE_SIZE,
          offset: (page - 1) * OPDS_PAGE_SIZE,
          renderableOnly: true,
        });

        return opdsResponse(
          articleFeed(cards, {
            baseUrl,
            id: opdsLatestUrl(baseUrl),
            page,
            selfHref: opdsLatestUrl(baseUrl),
            subtitle: `The newest articles across ${SITE_NAME}.`,
            title: "Latest",
          }),
          opdsFormatFromRequest(request),
        );
      },
    },
  },
});
