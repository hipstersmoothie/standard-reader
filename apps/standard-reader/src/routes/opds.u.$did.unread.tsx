import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { EPUB_TYPE, OPDS_REL } from "#/lib/opds/model";
import {
  OPDS_PRIVATE_CACHE_CONTROL,
  opdsFormatFromRequest,
  opdsResponse,
} from "#/lib/opds/respond";
import { opdsShelfUrl, unreadEpubUrl } from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { unreadShelfCards } from "#/server/books/reader-shelf";
import { packageableCards } from "#/server/books/sources";
import {
  articleFeed,
  OPDS_PAGE_SIZE,
  pageFromRequest,
} from "#/server/opds/catalog";

export const Route = createFileRoute("/opds/u/$did/unread")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const did = params.did;
        if (!did.startsWith("did:")) {
          return new Response("Bad Request", { status: 400 });
        }

        const baseUrl = getPublicUrl();
        const page = pageFromRequest(request);
        // The unread walk is a keyset over the follow feed, so it does not page
        // by offset — fetching through the current page and slicing keeps the
        // catalog's paging honest without a second cursor vocabulary.
        const through = packageableCards(
          await unreadShelfCards(db, schema, did, {
            limit: OPDS_PAGE_SIZE * page,
          }),
        );
        const cards = through.slice((page - 1) * OPDS_PAGE_SIZE);
        const self = `${opdsShelfUrl(baseUrl, did)}/unread`;

        return opdsResponse(
          articleFeed(cards, {
            baseUrl,
            extraLinks: [
              {
                href: unreadEpubUrl(baseUrl, did),
                rel: OPDS_REL.openAccess,
                title: "Everything unread, as one book",
                type: EPUB_TYPE,
              },
            ],
            id: self,
            page,
            selfHref: self,
            subtitle:
              "Articles you have not read yet, from the publications and people you follow.",
            title: "Unread",
            upHref: opdsShelfUrl(baseUrl, did),
          }),
          opdsFormatFromRequest(request),
          { cacheControl: OPDS_PRIVATE_CACHE_CONTROL },
        );
      },
    },
  },
});
