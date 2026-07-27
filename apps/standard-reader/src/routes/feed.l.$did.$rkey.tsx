import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { renderRssFeed } from "#/lib/feeds/rss";
import { getPublicUrl } from "#/lib/public-url";
import { listFeedUrl, SITE_DESCRIPTION } from "#/lib/site-metadata";
import { feedItemsFromCards, loadFeedItemBodies } from "#/server/feeds/build";
import { selectArticleCards } from "#/server/reader/queries";
import { readList } from "#/server/reader/saved-lists";

const CACHE_CONTROL = "public, max-age=900, stale-while-revalidate=3600";
const FEED_LIMIT = 50;

export const Route = createFileRoute("/feed/l/$did/$rkey")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { did, rkey } = params;
        const list = await readList(db, did, rkey);
        if (!list) {
          return new Response("Not Found", { status: 404 });
        }

        const baseUrl = getPublicUrl();
        const cards = await selectArticleCards(db, schema, {
          publicationUris: list.publications,
          limit: FEED_LIMIT,
        });
        const bodies = await loadFeedItemBodies(
          db,
          schema,
          cards.map((card) => card.uri),
        );
        const items = feedItemsFromCards(cards, bodies, baseUrl);

        const xml = renderRssFeed(
          {
            title: list.name,
            link: `${baseUrl}/l/${did}/${rkey}`,
            description: list.description ?? SITE_DESCRIPTION,
            selfUrl: listFeedUrl(baseUrl, did, rkey),
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
