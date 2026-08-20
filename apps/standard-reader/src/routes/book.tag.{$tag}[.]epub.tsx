import { createFileRoute } from "@tanstack/react-router";

import { tagDisplayTitle } from "#/components/reader/format";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { getPublicUrl } from "#/lib/public-url";
import { buildEpub } from "#/server/books/epub";
import { bookResponse } from "#/server/books/respond";
import {
  BOOK_ARTICLE_LIMIT,
  bookFilename,
  bookFromCards,
  packageableCards,
} from "#/server/books/sources";
import { selectArticleCards } from "#/server/reader/queries";

export const Route = createFileRoute("/book/tag/{$tag}.epub")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const tag = decodeURIComponent(params.tag).trim();
        if (!tag) {
          return new Response("Bad Request", { status: 400 });
        }

        const cards = packageableCards(
          await selectArticleCards(db, schema, {
            discoverOnly: true,
            limit: BOOK_ARTICLE_LIMIT,
            renderableOnly: true,
            tag,
          }),
        );
        if (cards.length === 0) {
          return new Response("Not Found", { status: 404 });
        }

        const baseUrl = getPublicUrl();
        const title = tagDisplayTitle(tag);
        const spec = await bookFromCards(db, schema, cards, {
          authors: [],
          baseUrl,
          description: `Recent articles tagged "${tag}" from across the network.`,
          identifier: `${baseUrl}/book/tag/${encodeURIComponent(tag)}.epub`,
          sourceUrl: `${baseUrl}/tag/${encodeURIComponent(tag)}`,
          subjects: [tag],
          subtitle: `${cards.length} recent ${cards.length === 1 ? "article" : "articles"}`,
          title,
        });

        const epub = await buildEpub(spec);
        return bookResponse(epub, {
          contentType: "application/epub+zip",
          filename: bookFilename(title, ".epub"),
          request,
        });
      },
    },
  },
});
