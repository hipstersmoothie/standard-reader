import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { isWeekKey } from "#/lib/weekly-picks";
import { blockFilterDid } from "#/server/blocks/blocks";
import { muteFilterDid } from "#/server/mutes/mutes";
import { observe } from "#/server/observability/log";
import { attachReaderSpanContext } from "#/server/observability/span-context.ts";
import { attachCommentCountsToArticles } from "#/server/reader/document-comments";
import { selectArticleCardsByUris } from "#/server/reader/queries";
import { attachViewerRecommendedToArticles } from "#/server/reader/recommended-by";
import {
  adjacentWeeklyPicks,
  latestWeeklyPicksKey,
  readWeeklyPicks,
} from "#/server/reader/weekly-picks";

import type { ArticleCard } from "./api-shapes";
import { dbMiddleware } from "./db-middleware";

/**
 * The weekly "hottest reads" page (`/weekly/$week`) — the Standard Reader page
 * the Friday Bluesky thread roots on. Public: the thread links here for
 * everyone, signed in or not.
 */

const WEEK_MS = 7 * 86_400_000;

const weekInput = z.object({
  week: z.string().refine(isWeekKey, "Expected an ISO week like 2026-W42"),
});

export interface WeeklyPick {
  /** 1-based rank as posted — stable even when a pick is hidden from you. */
  rank: number;
  article: ArticleCard;
}

export interface WeeklyPicksPage {
  periodKey: string;
  /** The seven days the ranking covered (ISO strings). */
  windowStart: string;
  windowEnd: string;
  picks: Array<WeeklyPick>;
  /** The Bluesky thread this page roots, once posted (`app.bsky.feed.post`). */
  threadUri: string | null;
  previous: string | null;
  next: string | null;
}

const getWeeklyPicks = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(weekInput)
  .handler(
    observe(
      "weekly.getPicks",
      async ({ data, context }, span): Promise<WeeklyPicksPage | null> => {
        const { db, schema } = context;
        const did = await attachReaderSpanContext(span, getRequest());
        span.set("week", data.week);

        const row = await readWeeklyPicks(db, schema, data.week);
        if (!row) return null;

        const trackReading = did == null ? false : context.trackReadingEnabled;
        const [cards, adjacent] = await Promise.all([
          selectArticleCardsByUris(db, schema, row.articleUris, {
            readForDid: trackReading && did ? did : undefined,
            countOldPostsAsUnread:
              did == null ? true : context.countOldPostsAsUnreadEnabled,
            viewerDid: await blockFilterDid(db, schema, did),
            muterDid: await muteFilterDid(db, schema, did),
          }),
          adjacentWeeklyPicks(db, schema, data.week),
        ]);
        const withComments = await attachCommentCountsToArticles(
          db,
          schema,
          cards,
        );
        const articles = await attachViewerRecommendedToArticles(
          db,
          schema,
          did,
          withComments,
        );

        // Rank comes from the posted order, not the hydrated list: a pick
        // that was deleted, or that this reader blocks or mutes, drops out
        // without renumbering the rest — the page must agree with the thread.
        const rankOf = new Map(row.articleUris.map((uri, i) => [uri, i + 1]));
        // `selectArticleCardsByUris` keeps the posted order.
        const picks = articles.map((article) => ({
          rank: rankOf.get(article.uri) ?? 0,
          article,
        }));
        span.set("count", picks.length);

        return {
          periodKey: row.periodKey,
          windowStart: new Date(row.pickedAt.getTime() - WEEK_MS).toISOString(),
          windowEnd: row.pickedAt.toISOString(),
          picks,
          threadUri: row.rootUri,
          previous: adjacent.previous,
          next: adjacent.next,
        };
      },
    ),
  );

/** The newest week with a page — where `/weekly` sends you. */
const getLatestWeek = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("weekly.getLatest", async ({ context }) =>
      latestWeeklyPicksKey(context.db, context.schema),
    ),
  );

function getWeeklyPicksQueryOptions({ week }: z.input<typeof weekInput>) {
  return queryOptions({
    queryKey: ["weekly", "picks", week] as const,
    queryFn: async () => getWeeklyPicks({ data: { week } }),
    // A posted week never changes; only engagement counts drift.
    staleTime: 5 * 60_000,
  });
}

export const weeklyApi = {
  getWeeklyPicks,
  getWeeklyPicksQueryOptions,
  getLatestWeek,
};
