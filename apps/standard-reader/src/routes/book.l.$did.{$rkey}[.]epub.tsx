import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { getPublicUrl } from "#/lib/public-url";
import { blockFilterDid } from "#/server/blocks/blocks";
import { buildEpub } from "#/server/books/epub";
import {
  BOOK_PRIVATE_CACHE_CONTROL,
  bookResponse,
} from "#/server/books/respond";
import {
  BOOK_ARTICLE_LIMIT,
  bookFilename,
  bookFromCards,
  packageableCards,
} from "#/server/books/sources";
import { selectArticleCards } from "#/server/reader/queries";
import { readList } from "#/server/reader/saved-lists";

export const Route = createFileRoute("/book/l/$did/{$rkey}.epub")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { did, rkey } = params;
        const list = await readList(db, did, rkey);
        if (!list) {
          return new Response("Not Found", { status: 404 });
        }

        // The list owner is the reader this book is for, so their blocks apply
        // — the same reasoning as the list's RSS feed.
        const cards = packageableCards(
          await selectArticleCards(db, schema, {
            limit: BOOK_ARTICLE_LIMIT,
            publicationUris: list.publications,
            renderableOnly: true,
            viewerDid: await blockFilterDid(db, schema, did),
          }),
        );
        if (cards.length === 0) {
          return new Response("Not Found", { status: 404 });
        }

        const baseUrl = getPublicUrl();
        const spec = await bookFromCards(db, schema, cards, {
          baseUrl,
          description: list.description,
          identifier: `at://${did}/app.standard-reader.list/${rkey}`,
          sourceUrl: `${baseUrl}/l/${did}/${rkey}`,
          subtitle: `${cards.length} recent ${cards.length === 1 ? "article" : "articles"}`,
          title: list.name,
        });

        const epub = await buildEpub(spec);
        return bookResponse(epub, {
          cacheControl: BOOK_PRIVATE_CACHE_CONTROL,
          contentType: "application/epub+zip",
          filename: bookFilename(list.name, ".epub"),
          request,
        });
      },
    },
  },
});
