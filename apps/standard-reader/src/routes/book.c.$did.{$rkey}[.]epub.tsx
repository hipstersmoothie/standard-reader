import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { collectionDocumentUri } from "#/lib/atproto/collection-uris";
import { parseCollectionManifest } from "#/lib/collections/manifest";
import { didFromParam } from "#/lib/opds/did-param";
import { getPublicUrl } from "#/lib/public-url";
import { cdnImageUrl } from "#/server/atproto/blob";
import { buildEpub } from "#/server/books/epub";
import { bookResponse } from "#/server/books/respond";
import {
  bookFilename,
  bookFromCards,
  packageableCards,
} from "#/server/books/sources";
import { selectArticleCardsByUris } from "#/server/reader/queries";

export const Route = createFileRoute("/book/c/$did/{$rkey}.epub")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { rkey } = params;
        const did = didFromParam(params.did);
        if (!did) {
          return new Response("Bad Request", { status: 400 });
        }

        const uri = collectionDocumentUri(did, rkey);
        const [row] = await db
          .select({
            collectionJson: schema.documents.collectionJson,
            coverImageCid: schema.documents.coverImageCid,
            description: schema.documents.description,
            title: schema.documents.title,
          })
          .from(schema.documents)
          .where(
            and(
              eq(schema.documents.uri, uri),
              eq(schema.documents.deleted, false),
            ),
          )
          .limit(1);

        const manifest = row
          ? parseCollectionManifest(row.collectionJson)
          : null;
        if (!row || !manifest) {
          return new Response("Not Found", { status: 404 });
        }

        // The manifest is an editor's running order; the DB returns rows in
        // whatever order it likes, so the manifest is re-imposed on them.
        const itemUris = manifest.items.map((item) => item.document);
        const itemCards = await selectArticleCardsByUris(db, schema, itemUris);
        const byUri = new Map(itemCards.map((card) => [card.uri, card]));
        const cards = packageableCards(
          itemUris.flatMap((itemUri) => {
            const card = byUri.get(itemUri);
            return card ? [card] : [];
          }),
        );
        if (cards.length === 0) {
          return new Response("Not Found", { status: 404 });
        }

        const baseUrl = getPublicUrl();
        const spec = await bookFromCards(db, schema, cards, {
          baseUrl,
          coverImageUrl: row.coverImageCid
            ? cdnImageUrl(did, row.coverImageCid)
            : null,
          description: row.description,
          identifier: uri,
          sourceUrl: `${baseUrl}/collection/${did}/${rkey}`,
          subtitle: `${cards.length} ${cards.length === 1 ? "piece" : "pieces"}`,
          title: row.title,
        });

        const epub = await buildEpub(spec);
        return bookResponse(epub, {
          contentType: "application/epub+zip",
          filename: bookFilename(row.title, ".epub"),
          request,
        });
      },
    },
  },
});
