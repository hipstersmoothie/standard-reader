import { createFileRoute } from "@tanstack/react-router";

import { publicationUriFromParams } from "#/components/reader/format";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { opdsFormatFromRequest, opdsResponse } from "#/lib/opds/respond";
import {
  opdsComicsUrl,
  opdsPublicationsUrl,
  opdsPublicationUrl,
} from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import {
  articleFeed,
  OPDS_PAGE_SIZE,
  pageFromRequest,
} from "#/server/opds/catalog";
import { comicShelfEntries } from "#/server/opds/comics";
import { publicationBookEntry } from "#/server/opds/entries";
import { selectComicShelf } from "#/server/reader/comic";
import { selectPublicationHeader } from "#/server/reader/publication-header";
import { selectPublicationArticleCards } from "#/server/reader/queries";

export const Route = createFileRoute("/opds/p/$did/$rkey")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { did, rkey } = params;
        if (!did.startsWith("did:")) {
          return new Response("Bad Request", { status: 400 });
        }

        const publicationUri = publicationUriFromParams(did, rkey);
        const header = await selectPublicationHeader(
          db,
          schema,
          publicationUri,
        );
        if (!header) {
          return new Response("Not Found", { status: 404 });
        }

        const baseUrl = getPublicUrl();
        const page = pageFromRequest(request);
        const publication = header.publication;
        const self = opdsPublicationUrl(baseUrl, did, rkey);

        // A comic's documents are pages, not issues — an article feed here
        // would offer a comic app dozens of one-page "comics". The shelf is
        // where the app already works out what one unit is.
        if (publication.serial?.kind === "comic") {
          const shelf = await selectComicShelf(db, schema, publicationUri);
          const comicFeed = articleFeed([], {
            baseUrl,
            iconUrl: publication.iconUrl,
            id: publicationUri,
            page: 1,
            selfHref: self,
            subtitle: publication.description,
            title: publication.name,
            upHref: opdsComicsUrl(baseUrl),
          });
          comicFeed.publications = comicShelfEntries(
            shelf,
            publication,
            baseUrl,
          );
          return opdsResponse(comicFeed, opdsFormatFromRequest(request));
        }

        const cards = await selectPublicationArticleCards(db, schema, {
          limit: OPDS_PAGE_SIZE,
          offset: (page - 1) * OPDS_PAGE_SIZE,
          publicationUri,
          renderableOnly: true,
        });

        const feed = articleFeed(cards, {
          baseUrl,
          iconUrl: publication.iconUrl,
          id: publicationUri,
          page,
          selfHref: self,
          subtitle: publication.description,
          title: publication.name,
          upHref: opdsPublicationsUrl(baseUrl),
        });

        // The whole-publication book leads the first page: a reader who came
        // here to take the publication with them should not have to page to the
        // end to find it.
        if (page === 1 && cards.length > 0) {
          feed.publications = [
            publicationBookEntry(publication, baseUrl, {
              articleCount: cards.length,
              updated: feed.updated,
            }),
            ...(feed.publications ?? []),
          ];
        }

        return opdsResponse(feed, opdsFormatFromRequest(request));
      },
    },
  },
});
