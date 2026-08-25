import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { EPUB_TYPE, OPDS_REL } from "#/lib/opds/model";
import {
  OPDS_PRIVATE_CACHE_CONTROL,
  opdsFormatFromRequest,
  opdsResponse,
} from "#/lib/opds/respond";
import { listEpubUrl, opdsShelfUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { blockFilterDid } from "#/server/blocks/blocks";
import {
  articleFeed,
  OPDS_PAGE_SIZE,
  pageFromRequest,
} from "#/server/opds/catalog";
import { selectArticleCards } from "#/server/reader/queries";
import { readList } from "#/server/reader/saved-lists";

export const Route = createFileRoute("/opds/l/$did/$rkey")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { did, rkey } = params;
        const list = await readList(db, did, rkey);
        if (!list) {
          return new Response("Not Found", { status: 404 });
        }

        const baseUrl = getPublicUrl();
        const page = pageFromRequest(request);
        const cards = await selectArticleCards(db, schema, {
          limit: OPDS_PAGE_SIZE,
          offset: (page - 1) * OPDS_PAGE_SIZE,
          publicationUris: list.publications,
          renderableOnly: true,
          viewerDid: await blockFilterDid(db, schema, did),
        });
        const self = `${baseUrl}/opds/l/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;

        return opdsResponse(
          articleFeed(cards, {
            baseUrl,
            extraLinks: [
              {
                href: listEpubUrl(baseUrl, did, rkey),
                rel: OPDS_REL.openAccess,
                title: `${list.name} as one book`,
                type: EPUB_TYPE,
              },
            ],
            id: list.uri,
            page,
            selfHref: self,
            subtitle: list.description,
            title: list.name,
            upHref: opdsShelfUrl(baseUrl, did),
          }),
          opdsFormatFromRequest(request),
          { cacheControl: OPDS_PRIVATE_CACHE_CONTROL },
        );
      },
    },
  },
});
