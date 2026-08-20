import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { getPublicUrl } from "#/lib/public-url";
import { buildEpub } from "#/server/books/epub";
import {
  shelfReader,
  shelfReaderName,
  unreadShelfCards,
} from "#/server/books/reader-shelf";
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

export const Route = createFileRoute("/book/u/$did/unread.epub")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const did = params.did;
        if (!did.startsWith("did:")) {
          return new Response("Bad Request", { status: 400 });
        }

        const cards = packageableCards(
          await unreadShelfCards(db, schema, did, {
            limit: BOOK_ARTICLE_LIMIT,
          }),
        );
        if (cards.length === 0) {
          return new Response("Not Found", { status: 404 });
        }

        const reader = shelfReaderName(await shelfReader(db, schema, did), did);
        const baseUrl = getPublicUrl();
        const spec = await bookFromCards(db, schema, cards, {
          authors: [],
          baseUrl,
          description: `Unread articles from the publications ${reader} subscribes to.`,
          identifier: `${baseUrl}/book/u/${did}/unread.epub`,
          sourceUrl: `${baseUrl}/latest`,
          subtitle: `${cards.length} unread ${cards.length === 1 ? "article" : "articles"}`,
          title: "Unread",
        });

        const epub = await buildEpub(spec);
        return bookResponse(epub, {
          cacheControl: BOOK_PRIVATE_CACHE_CONTROL,
          contentType: "application/epub+zip",
          filename: bookFilename("Unread", ".epub"),
          request,
        });
      },
    },
  },
});
