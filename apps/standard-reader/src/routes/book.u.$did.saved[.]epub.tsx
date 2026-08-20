import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { getPublicUrl } from "#/lib/public-url";
import { SITE_NAME } from "#/lib/site-metadata";
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
import { savedForLater } from "#/server/reader/queries";

export const Route = createFileRoute("/book/u/$did/saved.epub")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const did = params.did;
        if (!did.startsWith("did:")) {
          return new Response("Bad Request", { status: 400 });
        }

        const cards = packageableCards(
          await savedForLater(db, schema, { did, limit: BOOK_ARTICLE_LIMIT }),
        );
        if (cards.length === 0) {
          return new Response("Not Found", { status: 404 });
        }

        const [profile] = await db
          .select({
            displayName: schema.profiles.displayName,
            handle: schema.profiles.handle,
          })
          .from(schema.profiles)
          .where(eq(schema.profiles.did, did))
          .limit(1);
        const reader = profile?.displayName ?? profile?.handle ?? did;

        const baseUrl = getPublicUrl();
        const spec = await bookFromCards(db, schema, cards, {
          authors: [],
          baseUrl,
          description: `Articles ${reader} saved to read later on ${SITE_NAME}.`,
          identifier: `${baseUrl}/book/u/${did}/saved.epub`,
          sourceUrl: `${baseUrl}/saved`,
          subtitle: `${cards.length} ${cards.length === 1 ? "article" : "articles"} saved by ${reader}`,
          title: "Saved for later",
        });

        const epub = await buildEpub(spec);
        return bookResponse(epub, {
          cacheControl: BOOK_PRIVATE_CACHE_CONTROL,
          contentType: "application/epub+zip",
          filename: bookFilename("Saved for later", ".epub"),
          request,
        });
      },
    },
  },
});
