import { createFileRoute } from "@tanstack/react-router";

import { publicationUriFromParams } from "#/components/reader/format";
import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { renderRssFeed } from "#/lib/feeds/rss";
import { getPublicUrl } from "#/lib/public-url";
import { publicationFeedUrl } from "#/lib/site-metadata";
import { feedItemsFromCards, loadFeedItemBodies } from "#/server/feeds/build";
import { selectPublicationHeader } from "#/server/reader/publication-header";
import { selectPublicationArticleCards } from "#/server/reader/queries";

const CACHE_CONTROL = "public, max-age=900, stale-while-revalidate=3600";
const FEED_LIMIT = 50;

export const Route = createFileRoute("/feed/p/$did/$rkey")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { did, rkey } = params;
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
        const cards = await selectPublicationArticleCards(db, schema, {
          publicationUri,
          limit: FEED_LIMIT,
        });
        const bodies = await loadFeedItemBodies(
          db,
          schema,
          cards.map((card) => card.uri),
        );
        const items = feedItemsFromCards(
          cards,
          bodies,
          baseUrl,
          header.publication.name,
        );

        const xml = renderRssFeed(
          {
            title: header.publication.name,
            link: `${baseUrl}/p/${did}/${rkey}`,
            description:
              header.publication.description ?? header.publication.name,
            selfUrl: publicationFeedUrl(baseUrl, did, rkey),
            imageUrl: header.publication.iconUrl,
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
