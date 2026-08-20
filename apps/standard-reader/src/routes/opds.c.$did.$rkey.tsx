import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { collectionDocumentUri } from "#/lib/atproto/collection-uris";
import { parseCollectionManifest } from "#/lib/collections/manifest";
import { EPUB_TYPE, OPDS_REL } from "#/lib/opds/model";
import { opdsFormatFromRequest, opdsResponse } from "#/lib/opds/respond";
import {
  collectionEpubUrl,
  opdsCollectionsUrl,
  opdsCollectionUrl,
} from "#/lib/opds/urls";
import { getPublicUrl } from "#/lib/public-url";
import { cdnImageUrl } from "#/server/atproto/blob";
import { packageableCards } from "#/server/books/sources";
import { articleFeed } from "#/server/opds/catalog";
import { selectArticleCardsByUris } from "#/server/reader/queries";

export const Route = createFileRoute("/opds/c/$did/$rkey")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { did, rkey } = params;
        if (!did.startsWith("did:")) {
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

        const baseUrl = getPublicUrl();
        const itemUris = manifest.items.map((item) => item.document);
        const itemCards = await selectArticleCardsByUris(db, schema, itemUris);
        const byUri = new Map(itemCards.map((card) => [card.uri, card]));
        // A collection is an editor's running order, so it is served in that
        // order rather than by date.
        const cards = packageableCards(
          itemUris.flatMap((itemUri) => {
            const card = byUri.get(itemUri);
            return card ? [card] : [];
          }),
        );

        return opdsResponse(
          articleFeed(cards, {
            baseUrl,
            extraLinks: [
              {
                href: collectionEpubUrl(baseUrl, did, rkey),
                rel: OPDS_REL.openAccess,
                title: `${row.title} as one book`,
                type: EPUB_TYPE,
              },
            ],
            iconUrl: row.coverImageCid
              ? cdnImageUrl(did, row.coverImageCid)
              : null,
            id: uri,
            page: 1,
            selfHref: opdsCollectionUrl(baseUrl, did, rkey),
            subtitle: row.description,
            title: row.title,
            upHref: opdsCollectionsUrl(baseUrl),
          }),
          opdsFormatFromRequest(request),
        );
      },
    },
  },
});
