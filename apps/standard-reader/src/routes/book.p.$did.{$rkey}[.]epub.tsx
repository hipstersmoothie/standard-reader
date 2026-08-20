import { createFileRoute } from "@tanstack/react-router";

import { publicationUriFromParams } from "#/components/reader/format";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { didFromParam } from "#/lib/opds/did-param";
import { getPublicUrl } from "#/lib/public-url";
import { buildEpub } from "#/server/books/epub";
import { bookResponse } from "#/server/books/respond";
import {
  BOOK_ARTICLE_LIMIT,
  bookFilename,
  bookFromCards,
  packageableCards,
} from "#/server/books/sources";
import { selectPublicationHeader } from "#/server/reader/publication-header";
import { selectPublicationArticleCards } from "#/server/reader/queries";

export const Route = createFileRoute("/book/p/$did/{$rkey}.epub")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { rkey } = params;
        const did = didFromParam(params.did);
        if (!did) {
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
        const cards = packageableCards(
          await selectPublicationArticleCards(db, schema, {
            limit: BOOK_ARTICLE_LIMIT,
            publicationUri,
            renderableOnly: true,
          }),
        );
        if (cards.length === 0) {
          return new Response("Not Found", { status: 404 });
        }

        const publication = header.publication;
        // A serial reads front-to-back, so its book does too. Everything else
        // is a blog, and a blog anthology reads newest-first like the archive.
        const ordered = publication.serial ? cards.toReversed() : cards;

        const spec = await bookFromCards(db, schema, ordered, {
          baseUrl,
          coverImageUrl: publication.iconUrl,
          description: publication.description,
          identifier: publicationUri,
          publisher: publication.name,
          sourceUrl: `${baseUrl}/p/${did}/${rkey}`,
          subtitle: `${ordered.length} ${ordered.length === 1 ? "article" : "articles"} from ${publication.name}`,
          title: publication.name,
        });

        const epub = await buildEpub(spec);
        return bookResponse(epub, {
          contentType: "application/epub+zip",
          filename: bookFilename(publication.name, ".epub"),
          request,
        });
      },
    },
  },
});
