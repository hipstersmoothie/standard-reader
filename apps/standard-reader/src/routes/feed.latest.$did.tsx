import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { renderRssFeed } from "#/lib/feeds/rss";
import { didFromParam } from "#/lib/opds/did-param";
import { getPublicUrl } from "#/lib/public-url";
import { latestFeedUrl, SITE_NAME } from "#/lib/site-metadata";
import { blockFilterDid } from "#/server/blocks/blocks";
import { feedItemsFromCards, loadFeedItemBodies } from "#/server/feeds/build";
import { selectArticleCards } from "#/server/reader/queries";
import { effectiveFollowUris } from "#/server/reader/saved-lists";

const CACHE_CONTROL = "public, max-age=900, stale-while-revalidate=3600";
const FEED_LIMIT = 50;

export const Route = createFileRoute("/feed/latest/$did")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const did = didFromParam(params.did);
        if (!did) {
          return new Response("Bad Request", { status: 400 });
        }

        const baseUrl = getPublicUrl();
        // `$did` is the reader this feed belongs to, so their blocks apply here
        // as they do on `/latest` itself. The feed URL is the only way in — a
        // reader who subscribed in an RSS client can't "just not look".
        const [followUris, blockDid] = await Promise.all([
          effectiveFollowUris(db, schema, did),
          blockFilterDid(db, schema, did),
        ]);
        const cards = await selectArticleCards(db, schema, {
          publicationUris: followUris,
          viewerDid: blockDid,
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
            title: `Your Latest · ${SITE_NAME}`,
            link: `${baseUrl}/latest`,
            description:
              "The newest articles from the publications you subscribe to.",
            selfUrl: latestFeedUrl(baseUrl, did),
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
