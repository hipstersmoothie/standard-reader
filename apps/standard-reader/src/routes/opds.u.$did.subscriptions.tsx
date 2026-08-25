import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { didFromParam } from "#/lib/opds/did-param";
import {
  OPDS_PRIVATE_CACHE_CONTROL,
  opdsFormatFromRequest,
  opdsResponse,
} from "#/lib/opds/respond";
import { opdsShelfUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { blockFilterDid } from "#/server/blocks/blocks";
import {
  articleFeed,
  OPDS_PAGE_SIZE,
  pageFromRequest,
} from "#/server/opds/catalog";
import { selectArticleCards } from "#/server/reader/queries";
import { effectiveFollowSets } from "#/server/reader/saved-lists";

export const Route = createFileRoute("/opds/u/$did/subscriptions")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const did = didFromParam(params.did);
        if (!did) {
          return new Response("Bad Request", { status: 400 });
        }

        const baseUrl = getPublicUrl();
        const page = pageFromRequest(request);

        // This shelf belongs to `$did`, so their blocks apply — the same
        // reasoning as their personalised RSS feed: the URL is the only way in,
        // and a reader who subscribed on a device cannot "just not look".
        const [{ publicationUris, userDids }, viewerDid] = await Promise.all([
          effectiveFollowSets(db, schema, did),
          blockFilterDid(db, schema, did),
        ]);

        const cards = await selectArticleCards(db, schema, {
          followedUserDids: userDids,
          limit: OPDS_PAGE_SIZE,
          offset: (page - 1) * OPDS_PAGE_SIZE,
          publicationUris,
          renderableOnly: true,
          viewerDid,
        });
        const self = `${opdsShelfUrl(baseUrl, did)}/subscriptions`;

        return opdsResponse(
          articleFeed(cards, {
            baseUrl,
            id: self,
            page,
            selfHref: self,
            subtitle:
              "The newest articles from the publications and people you follow.",
            title: "Subscriptions",
            upHref: opdsShelfUrl(baseUrl, did),
          }),
          opdsFormatFromRequest(request),
          { cacheControl: OPDS_PRIVATE_CACHE_CONTROL },
        );
      },
    },
  },
});
