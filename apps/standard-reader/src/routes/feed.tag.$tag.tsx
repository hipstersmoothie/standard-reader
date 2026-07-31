import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { renderRssFeed } from "#/lib/feeds/rss";
import { getPublicUrl } from "#/lib/public-url";
import { SITE_NAME, tagFeedUrl } from "#/lib/site-metadata";
import { feedItemsFromCards, loadFeedItemBodies } from "#/server/feeds/build";
import { selectArticleCards } from "#/server/reader/queries";

const CACHE_CONTROL = "public, max-age=900, stale-while-revalidate=3600";
const FEED_LIMIT = 50;

export const Route = createFileRoute("/feed/tag/$tag")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const tag = decodeURIComponent(params.tag).trim();
        if (!tag) {
          return new Response("Bad Request", { status: 400 });
        }

        const baseUrl = getPublicUrl();
        const cards = await selectArticleCards(db, schema, {
          tag,
          discoverOnly: true,
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
            title: `#${tag} · ${SITE_NAME}`,
            link: `${baseUrl}/tag/${encodeURIComponent(tag)}`,
            description: `Articles tagged "${tag}" across the network.`,
            selfUrl: tagFeedUrl(baseUrl, tag),
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
