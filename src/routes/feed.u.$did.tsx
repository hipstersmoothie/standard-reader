import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { renderRssFeed } from "#/lib/feeds/rss";
import { getPublicUrl } from "#/lib/public-url";
import { authorFeedUrl, SITE_NAME } from "#/lib/site-metadata";
import { feedItemsFromCards, loadFeedItemBodies } from "#/server/feeds/build";
import { authorDocuments } from "#/server/reader/queries";

const CACHE_CONTROL = "public, max-age=900, stale-while-revalidate=3600";
const FEED_LIMIT = 50;

export const Route = createFileRoute("/feed/u/$did")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const did = params.did;
        if (!did.startsWith("did:")) {
          return new Response("Bad Request", { status: 400 });
        }

        const [profile] = await db
          .select({
            handle: schema.profiles.handle,
            displayName: schema.profiles.displayName,
            avatarUrl: schema.profiles.avatarUrl,
          })
          .from(schema.profiles)
          .where(eq(schema.profiles.did, did))
          .limit(1);

        const baseUrl = getPublicUrl();
        // Same source as the profile's Posts tab — their own repo plus posts
        // crediting them as a contributor — so subscribing to the feed and
        // reading the profile agree.
        const { items: cards } = await authorDocuments(db, schema, {
          did,
          limit: FEED_LIMIT,
        });
        const bodies = await loadFeedItemBodies(
          db,
          schema,
          cards.map((card) => card.uri),
        );
        const authorName = profile?.displayName ?? profile?.handle ?? did;
        const items = feedItemsFromCards(cards, bodies, baseUrl, authorName);

        const xml = renderRssFeed(
          {
            title: `${authorName} · ${SITE_NAME}`,
            link: `${baseUrl}/u/${encodeURIComponent(did)}`,
            description: `Articles by ${authorName} across the network.`,
            selfUrl: authorFeedUrl(baseUrl, did),
            imageUrl: profile?.avatarUrl,
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
