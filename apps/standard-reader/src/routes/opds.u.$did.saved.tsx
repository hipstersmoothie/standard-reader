import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { EPUB_TYPE, OPDS_REL } from "#/lib/opds/model";
import {
  OPDS_PRIVATE_CACHE_CONTROL,
  opdsFormatFromRequest,
  opdsResponse,
} from "#/lib/opds/respond";
import { opdsShelfUrl, savedEpubUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { packageableCards } from "#/server/books/sources";
import {
  articleFeed,
  OPDS_PAGE_SIZE,
  pageFromRequest,
} from "#/server/opds/catalog";
import { savedForLater } from "#/server/reader/queries";

export const Route = createFileRoute("/opds/u/$did/saved")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const did = params.did;
        if (!did.startsWith("did:")) {
          return new Response("Bad Request", { status: 400 });
        }

        const baseUrl = getPublicUrl();
        const page = pageFromRequest(request);
        // `savedForLater` has no offset, so pages are sliced from one read —
        // a reading list long enough for that to hurt is not a reading list.
        const through = packageableCards(
          await savedForLater(db, schema, {
            did,
            limit: OPDS_PAGE_SIZE * page,
          }),
        );
        const cards = through.slice((page - 1) * OPDS_PAGE_SIZE);
        const self = `${opdsShelfUrl(baseUrl, did)}/saved`;

        return opdsResponse(
          articleFeed(cards, {
            baseUrl,
            extraLinks: [
              {
                href: savedEpubUrl(baseUrl, did),
                rel: OPDS_REL.openAccess,
                title: "Everything saved, as one book",
                type: EPUB_TYPE,
              },
            ],
            id: self,
            page,
            selfHref: self,
            subtitle: "Articles you saved to read later.",
            title: "Saved for later",
            upHref: opdsShelfUrl(baseUrl, did),
          }),
          opdsFormatFromRequest(request),
          { cacheControl: OPDS_PRIVATE_CACHE_CONTROL },
        );
      },
    },
  },
});
