import { createFileRoute } from "@tanstack/react-router";

import { searchApi } from "#/integrations/tanstack-query/api-search.functions";
import { opdsFormatFromRequest, opdsResponse } from "#/lib/opds/respond";
import { opdsSearchUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { SITE_NAME } from "#/lib/site-metadata";
import {
  articleFeed,
  OPDS_PAGE_SIZE,
  pageFromRequest,
} from "#/server/opds/catalog";

export const Route = createFileRoute("/opds/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = getPublicUrl();
        const url = new URL(request.url);
        // OpenSearch clients send `q`; a few send `query` or `searchTerms`.
        const query = (
          url.searchParams.get("q") ??
          url.searchParams.get("query") ??
          url.searchParams.get("searchTerms") ??
          ""
        ).trim();
        const page = pageFromRequest(request);

        // Reuse the app's own search server function rather than restating its
        // query: it carries the ranking, the block/mute filters and the
        // index-friendly shape that took real work to get right.
        const results = query
          ? await searchApi.searchArticles({
              data: {
                limit: OPDS_PAGE_SIZE,
                offset: (page - 1) * OPDS_PAGE_SIZE,
                q: query.slice(0, 512),
              },
            })
          : { items: [] };

        return opdsResponse(
          articleFeed(results.items, {
            baseUrl,
            id: opdsSearchUrl(baseUrl, query || undefined),
            page,
            selfHref: opdsSearchUrl(baseUrl, query || undefined),
            subtitle: query
              ? `Articles matching “${query}”.`
              : `Search ${SITE_NAME} for an article.`,
            title: query ? `Search: ${query}` : "Search",
          }),
          opdsFormatFromRequest(request),
        );
      },
    },
  },
});
