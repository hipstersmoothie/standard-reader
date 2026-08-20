import { createFileRoute } from "@tanstack/react-router";

import { tagDisplayTitle } from "#/components/reader/format";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { EPUB_TYPE, OPDS_REL } from "#/lib/opds/model";
import { opdsFormatFromRequest, opdsResponse } from "#/lib/opds/respond";
import { opdsTagsUrl, opdsTagUrl, tagEpubUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import {
  articleFeed,
  OPDS_PAGE_SIZE,
  pageFromRequest,
} from "#/server/opds/catalog";
import { selectArticleCards } from "#/server/reader/queries";

export const Route = createFileRoute("/opds/tag/$tag")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const tag = decodeURIComponent(params.tag).trim();
        if (!tag) {
          return new Response("Bad Request", { status: 400 });
        }

        const baseUrl = getPublicUrl();
        const page = pageFromRequest(request);

        // No `totalResults`: `countTagArticles` counts every tagged document,
        // including the bridged link posts this feed leaves out, so reporting it
        // would tell the client to keep paging past the end. The short-page
        // heuristic in `articleFeed` is the honest signal here.
        const cards = await selectArticleCards(db, schema, {
          discoverOnly: true,
          limit: OPDS_PAGE_SIZE,
          offset: (page - 1) * OPDS_PAGE_SIZE,
          renderableOnly: true,
          tag,
        });

        return opdsResponse(
          articleFeed(cards, {
            baseUrl,
            // The whole tag as one book, alongside the per-article downloads.
            extraLinks: [
              {
                href: tagEpubUrl(baseUrl, tag),
                rel: OPDS_REL.openAccess,
                title: `${tagDisplayTitle(tag)} as one book`,
                type: EPUB_TYPE,
              },
            ],
            id: opdsTagUrl(baseUrl, tag),
            page,
            selfHref: opdsTagUrl(baseUrl, tag),
            subtitle: `Articles tagged “${tag}” from across the network.`,
            title: tagDisplayTitle(tag),
            upHref: opdsTagsUrl(baseUrl),
          }),
          opdsFormatFromRequest(request),
        );
      },
    },
  },
});
