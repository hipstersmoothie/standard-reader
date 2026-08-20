import { createFileRoute } from "@tanstack/react-router";

import { documentUriFromParams } from "#/components/reader/format";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { getPublicUrl } from "#/lib/public-url";
import { buildEpub } from "#/server/books/epub";
import { bookResponse } from "#/server/books/respond";
import {
  bookFilename,
  bookFromCards,
  cardByline,
  cardSourceUrl,
} from "#/server/books/sources";
import { rememberDownloadHashes } from "#/server/kosync/register";
import { selectArticleCardsByUris } from "#/server/reader/queries";

export const Route = createFileRoute("/book/a/$did/{$rkey}.epub")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { did, rkey } = params;
        if (!did.startsWith("did:")) {
          return new Response("Bad Request", { status: 400 });
        }

        const uri = documentUriFromParams(did, rkey);
        const [card] = await selectArticleCardsByUris(db, schema, [uri]);
        // `hasRenderableBody` is the app's own judgement that a document has a
        // body worth showing — bridged link posts and bare Bluesky anchors do
        // not. Packaging one of those would produce a "book" that is a title
        // and a link, so the catalog never offers it and neither does this.
        if (!card || !card.hasRenderableBody) {
          return new Response("Not Found", { status: 404 });
        }

        const baseUrl = getPublicUrl();
        const byline = cardByline(card);
        const spec = await bookFromCards(db, schema, [card], {
          authors: byline ? [byline] : [],
          baseUrl,
          coverImageUrl: card.coverImageUrl,
          description: card.description,
          identifier: card.uri,
          publisher: card.publicationName ?? "Standard Reader",
          sourceUrl: cardSourceUrl(card, baseUrl),
          title: card.title,
        });

        const epub = await buildEpub(spec);
        const filename = bookFilename(card.title, ".epub");
        // The device will report progress against a hash of these exact bytes,
        // with no way to say which article it means — so the mapping is recorded
        // now, while both are in hand. See `server/kosync/document-hash.ts`.
        await rememberDownloadHashes(card.uri, epub, filename);

        return bookResponse(epub, {
          contentType: "application/epub+zip",
          filename,
          request,
        });
      },
    },
  },
});
