import { createFileRoute } from "@tanstack/react-router";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { isWeekKey } from "#/lib/weekly-picks";
import { renderWeeklyOgImage } from "#/server/og/weekly-card";
import { selectArticleCardsByUris } from "#/server/reader/queries";
import { readWeeklyPicks } from "#/server/reader/weekly-picks";

/**
 * A posted week's picks never change, but the thread job fetches this while
 * the week is still `running` — keep the cache short enough that a re-claimed
 * run's new picks are not stuck behind an old card for long.
 */
const CACHE_CONTROL = "public, max-age=3600, stale-while-revalidate=86400";

const WEEK_MS = 7 * 86_400_000;

const rangeFormat = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

/** The share card for `/weekly/$week`, also the thread root's thumbnail. */
export const Route = createFileRoute("/api/og/weekly/$week")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!isWeekKey(params.week)) {
          return new Response("Not Found", { status: 404 });
        }

        try {
          const row = await readWeeklyPicks(db, schema, params.week);
          if (!row) {
            return new Response("Not Found", { status: 404 });
          }

          const cards = await selectArticleCardsByUris(
            db,
            schema,
            row.articleUris,
            { lite: true },
          );
          const start = new Date(row.pickedAt.getTime() - WEEK_MS);

          const png = await renderWeeklyOgImage({
            periodKey: row.periodKey,
            dateRange: rangeFormat.formatRange(start, row.pickedAt),
            picks: cards.map((card) => ({
              title: card.title,
              byline: card.authorHandle
                ? `@${card.authorHandle}`
                : (card.publicationName ?? null),
            })),
          });

          return new Response(Buffer.from(png), {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": CACHE_CONTROL,
            },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to render image";
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
