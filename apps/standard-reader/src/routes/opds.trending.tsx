import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { opdsFormatFromRequest, opdsResponse } from "#/lib/opds/respond";
import { opdsTrendingUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import {
  articleFeed,
  OPDS_PAGE_SIZE,
  pageFromRequest,
} from "#/server/opds/catalog";
import { trendingArticles } from "#/server/reader/queries";

export const Route = createFileRoute("/opds/trending")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = getPublicUrl();
        const page = pageFromRequest(request);

        const cards = await trendingArticles(db, schema, OPDS_PAGE_SIZE, {
          offset: (page - 1) * OPDS_PAGE_SIZE,
          scope: "page",
        });

        return opdsResponse(
          articleFeed(cards, {
            baseUrl,
            id: opdsTrendingUrl(baseUrl),
            page,
            selfHref: opdsTrendingUrl(baseUrl),
            subtitle: "What the network is reading and recommending right now.",
            title: "Trending",
          }),
          opdsFormatFromRequest(request),
        );
      },
    },
  },
});
