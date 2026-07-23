import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { collectionDocumentUri } from "#/lib/atproto/collection-uris";
import { parseCollectionManifest } from "#/lib/collections/manifest";
import { renderRssFeed } from "#/lib/feeds/rss";
import { getPublicUrl } from "#/lib/public-url";
import { collectionFeedUrl, SITE_DESCRIPTION } from "#/lib/site-metadata";
import { cdnImageUrl } from "#/server/atproto/blob";
import { feedItemsFromCards, loadFeedItemBodies } from "#/server/feeds/build";
import { selectArticleCardsByUris } from "#/server/reader/queries";

const CACHE_CONTROL = "public, max-age=900, stale-while-revalidate=3600";

export const Route = createFileRoute("/feed/collection/$did/$rkey")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { did, rkey } = params;
        const uri = collectionDocumentUri(did, rkey);

        const [row] = await db
          .select({
            title: schema.documents.title,
            description: schema.documents.description,
            coverImageCid: schema.documents.coverImageCid,
            collectionJson: schema.documents.collectionJson,
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
        const cards = await selectArticleCardsByUris(db, schema, itemUris);
        const bodies = await loadFeedItemBodies(
          db,
          schema,
          cards.map((card) => card.uri),
        );
        const items = feedItemsFromCards(cards, bodies, baseUrl, row.title);

        const xml = renderRssFeed(
          {
            title: row.title,
            link: `${baseUrl}/collection/${did}/${rkey}`,
            description: row.description ?? SITE_DESCRIPTION,
            selfUrl: collectionFeedUrl(baseUrl, did, rkey),
            imageUrl: row.coverImageCid
              ? cdnImageUrl(did, row.coverImageCid)
              : null,
          },
          items,
        );

        return new Response(xml, {
          headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": CACHE_CONTROL,
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
