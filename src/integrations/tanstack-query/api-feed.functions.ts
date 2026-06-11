import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { observe } from "#/server/observability/log";
import { attachReaderSpanContext } from "#/server/observability/span-context.ts";
import { attachCommentCountsToArticles } from "#/server/reader/document-comments";
import {
  countFollowedDocuments,
  countNetworkDocuments,
  countTrendingDocuments,
  countUnreadByPublication,
  followedPublications,
  popularPublications,
  recommendedPublications,
  selectArticleCards,
  trendingArticles,
  trendingPublicationUris,
} from "#/server/reader/queries";
import { effectiveFollowUris } from "#/server/reader/saved-lists";
import {
  articleCardsAsAllRead,
  resolveTrackReadingHistoryEnabled,
} from "#/server/reader/track-reading-history";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { ArticleCard, PublicationCard } from "./api-shapes";

import { dbMiddleware } from "./db-middleware";

/**
 * Feed queries (`APP_VISION.md` §5): the signed-in reader's Home (featured lead
 * + latest unread + Trending/You-might-follow rails) and Latest (chronological
 * Unread/Subscriptions/All-network with counts). Reads come from the Neon read-model; personal
 * unread-state is joined from the reader's own `reads`. Signed-out / cold-start
 * readers fall back to discover-eligible network content + popularity.
 */

const HOME_ROW_LIMIT = 8;
const HOME_RAIL_LIMIT = 6;
/** Full trending tab on Latest — home rail stays at {@link HOME_RAIL_LIMIT}. */
export const TRENDING_PAGE_LIMIT = 100;
const LATEST_PAGE_SIZE = 20;

const homeInput = z.object({
  /** `follows` — subscriptions (default); `network` — whole-network discover feed. */
  scope: z.enum(["follows", "network"]).default("follows"),
});

export type HomeScope = z.infer<typeof homeInput>["scope"];

const latestInput = z.object({
  /**
   * - `unread` — unread documents from the reader's subscriptions
   * - `subscriptions` — all documents from the reader's subscriptions
   * - `all` — the whole network (discover-eligible publications)
   * - `trending` — network-wide articles ranked by trending score
   */
  filter: z
    .enum(["unread", "subscriptions", "all", "trending"])
    .default("subscriptions"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(TRENDING_PAGE_LIMIT)
    .default(LATEST_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
});

export type LatestFilter = z.infer<typeof latestInput>["filter"];

export interface HomeFeed {
  /** Full-width featured lead (newest featured unread, else newest unread). */
  featured: ArticleCard | null;
  /** Latest unread rows from follows (excludes the featured lead). */
  latestUnread: Array<ArticleCard>;
  /** Trending articles rail (network-wide). */
  trending: Array<ArticleCard>;
  /** Recommended publications rail ("You might follow"). */
  youMightFollow: Array<PublicationCard>;
  /** True when tailored to the reader's follows (vs cold-start/signed-out). */
  personalized: boolean;
  /** True when the signed-in reader has at least one follow. */
  hasFollows: boolean;
  /** Unread count across follows (null when not personalized). */
  unreadCount: number | null;
}

export interface LatestFeed {
  items: Array<ArticleCard>;
  counts: {
    /** Unread documents across the reader's subscriptions. */
    unread: number;
    /** All documents across the reader's subscriptions. */
    subscriptions: number;
    /** All discover-eligible documents across the network. */
    all: number;
    /** Articles in the trending candidate set. */
    trending: number;
  };
  /** Offset for the next page, or null when the last page was reached. */
  nextOffset: number | null;
}

export type FollowingPublication = PublicationCard & { unreadCount: number };

export interface SidebarData {
  /** Whether the reader is signed in (drives empty-state copy + auth chrome). */
  signedIn: boolean;
  /** Subscriptions or saved-list follows — mirrors home feed `personalized`. */
  hasFollows: boolean;
  /** Followed publications (most recent activity first) for the sidebar list. */
  following: Array<FollowingPublication>;
  /** Unread count across follows (null when signed out / no follows). */
  unreadCount: number | null;
  /** Saved-for-later count (null when signed out). */
  savedCount: number | null;
}

const getSidebar = createServerFn({ method: "GET" }).handler(
  observe("feed.getSidebar", async (_, span) => {
    const did = await attachReaderSpanContext(span, getRequest());
    if (!did) {
      return {
        signedIn: false,
        hasFollows: false,
        following: [],
        unreadCount: null,
        savedCount: null,
      } satisfies SidebarData;
    }

    const [{ db }, schema] = await Promise.all([
      import("#/db/index.server"),
      import("#/db/schema"),
    ]);

    const trackReading = await resolveTrackReadingHistoryEnabled(db, schema);

    // Effective follows: subscriptions plus saved-list publications.
    const followUris = await effectiveFollowUris(db, schema, did);
    const hasFollows = followUris.length > 0;
    span.set("follows", followUris.length);
    const b = schema.bookmarks;
    const [following, counts, unreadByPublication, savedCountRow] =
      await Promise.all([
        followedPublications(db, schema, followUris),
        trackReading && followUris.length > 0
          ? countFollowedDocuments(db, schema, followUris, did)
          : Promise.resolve(null),
        trackReading && followUris.length > 0
          ? countUnreadByPublication(db, schema, followUris, did)
          : Promise.resolve(new Map<string, number>()),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(b)
          .where(and(eq(b.ownerDid, did), eq(b.deleted, false))),
      ]);

    return {
      signedIn: true,
      hasFollows,
      following: following.map((pub) => ({
        ...pub,
        unreadCount: trackReading ? (unreadByPublication.get(pub.uri) ?? 0) : 0,
      })),
      unreadCount: trackReading ? (counts?.unread ?? null) : 0,
      savedCount: savedCountRow[0]?.count ?? 0,
    } satisfies SidebarData;
  }),
);

const getHomeFeed = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(homeInput)
  .handler(
    observe("feed.getHomeFeed", async ({ data, context }, span) => {
      const { db, schema } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      const followUris = did ? await effectiveFollowUris(db, schema, did) : [];
      const hasFollows = followUris.length > 0;
      const personalized = hasFollows && data.scope === "follows";
      const trackReading =
        did == null
          ? false
          : await resolveTrackReadingHistoryEnabled(db, schema);
      span.set("follows", followUris.length);
      span.set("scope", data.scope);
      span.set("personalized", personalized);

      const rowQuery = personalized
        ? {
            publicationUris: followUris,
            ...(trackReading && did ? { unreadForDid: did } : {}),
          }
        : { discoverOnly: true };

      const [featuredLead, rows, trendingRaw, trendingPubUris, counts] =
        await Promise.all([
          selectArticleCards(db, schema, {
            ...rowQuery,
            featuredOnly: true,
            limit: 1,
          }),
          selectArticleCards(db, schema, {
            ...rowQuery,
            limit: HOME_ROW_LIMIT + 1,
          }),
          trendingArticles(db, schema, HOME_RAIL_LIMIT),
          trendingPublicationUris(db, schema, HOME_RAIL_LIMIT),
          personalized && did && trackReading
            ? countFollowedDocuments(db, schema, followUris, did)
            : Promise.resolve(null),
        ]);

      const youMightFollowRaw =
        personalized && did
          ? await recommendedPublications(db, schema, did, HOME_RAIL_LIMIT, {
              excludeUris: trendingPubUris,
              followUris,
            })
          : await popularPublications(
              db,
              schema,
              HOME_RAIL_LIMIT,
              trendingPubUris,
            );

      let featured: ArticleCard | null = featuredLead[0] ?? rows[0] ?? null;
      let latestUnread = rows
        .filter((row) => row.uri !== featured?.uri)
        .slice(0, HOME_ROW_LIMIT);

      if (!trackReading || !personalized) {
        featured = featured ? { ...featured, isRead: true } : null;
        latestUnread = articleCardsAsAllRead(latestUnread);
      }

      const excludeUris = new Set(
        [featured?.uri, ...latestUnread.map((row) => row.uri)].filter(
          (uri): uri is string => uri != null,
        ),
      );
      const trending = trendingRaw
        .filter((article) => !excludeUris.has(article.uri))
        .slice(0, HOME_RAIL_LIMIT);
      const youMightFollow = youMightFollowRaw;

      span.set("rows", latestUnread.length);
      span.set("trending", trending.length);

      const enriched = await attachCommentCountsToArticles(db, schema, [
        ...(featured ? [featured] : []),
        ...latestUnread,
        ...trending,
      ]);
      const byUri = new Map(enriched.map((article) => [article.uri, article]));

      return {
        featured: featured ? (byUri.get(featured.uri) ?? featured) : null,
        latestUnread: latestUnread.map(
          (article) => byUri.get(article.uri) ?? article,
        ),
        trending: trending.map((article) => byUri.get(article.uri) ?? article),
        youMightFollow,
        personalized,
        hasFollows,
        unreadCount:
          personalized && trackReading ? (counts?.unread ?? null) : 0,
      } satisfies HomeFeed;
    }),
  );

const getLatestFeed = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(latestInput)
  .handler(
    observe("feed.getLatestFeed", async ({ data, context }, span) => {
      const { db, schema } = context;
      span.set("filter", data.filter);
      span.set("offset", data.offset);

      const did = await attachReaderSpanContext(span, getRequest());

      const followUris = did ? await effectiveFollowUris(db, schema, did) : [];
      span.set("follows", followUris.length);
      const trackReading =
        did == null
          ? false
          : await resolveTrackReadingHistoryEnabled(db, schema);

      const trendingLimit =
        data.filter === "trending"
          ? Math.min(data.limit, TRENDING_PAGE_LIMIT - data.offset)
          : data.limit;

      // Tab badges only need counts on the first page; pagination reuses cached counts.
      const includeCounts = data.offset === 0;

      const [items, followCounts, networkCount, trendingCount] =
        await Promise.all([
          data.filter === "trending"
            ? trendingLimit > 0
              ? trendingArticles(db, schema, trendingLimit, {
                  offset: data.offset,
                  readForDid: trackReading && did ? did : undefined,
                  scope: "page",
                })
              : Promise.resolve([])
            : selectArticleCards(db, schema, {
                // Signed-out readers always get the network-wide list.
                ...(!did || data.filter === "all"
                  ? { discoverOnly: true }
                  : {
                      publicationUris: followUris,
                      unreadForDid:
                        trackReading && data.filter === "unread"
                          ? did
                          : undefined,
                    }),
                readForDid: trackReading && did ? did : undefined,
                limit: data.limit,
                offset: data.offset,
              }),
          includeCounts && did
            ? countFollowedDocuments(db, schema, followUris, did)
            : Promise.resolve({ all: 0, unread: 0 }),
          includeCounts
            ? countNetworkDocuments(db, schema)
            : Promise.resolve(0),
          includeCounts && did
            ? countTrendingDocuments(
                db,
                schema,
                data.filter === "trending" ? "page" : "rail",
              )
            : Promise.resolve(0),
        ]);

      span.set("count", items.length);
      const enrichedItems = await attachCommentCountsToArticles(
        db,
        schema,
        trackReading ? items : articleCardsAsAllRead(items),
      );
      return {
        items: enrichedItems,
        counts: {
          unread: trackReading ? followCounts.unread : 0,
          subscriptions: followCounts.all,
          all: networkCount,
          trending: trendingCount,
        },
        nextOffset:
          data.filter === "trending"
            ? null
            : items.length === data.limit
              ? data.offset + data.limit
              : null,
      } satisfies LatestFeed;
    }),
  );

function getHomeFeedQueryOptions({
  scope = "follows",
}: z.input<typeof homeInput> = {}) {
  return queryOptions({
    queryKey: ["feed", "home", scope] as const,
    queryFn: async () => getHomeFeed({ data: { scope } }),
  });
}

export function latestFeedPageSize(filter: LatestFilter = "subscriptions") {
  return filter === "trending" ? TRENDING_PAGE_LIMIT : LATEST_PAGE_SIZE;
}

function getLatestFeedQueryOptions({
  filter = "subscriptions",
  limit = latestFeedPageSize(filter),
  offset = 0,
}: z.input<typeof latestInput> = {}) {
  return queryOptions({
    queryKey: ["feed", "latest", filter, limit, offset] as const,
    queryFn: async () => getLatestFeed({ data: { filter, limit, offset } }),
  });
}

function getSidebarQueryOptions() {
  return queryOptions({
    queryKey: ["feed", "sidebar"] as const,
    queryFn: async () => getSidebar(),
    staleTime: 5 * 60_000,
  });
}

export const feedApi = {
  getHomeFeed,
  getHomeFeedQueryOptions,
  getLatestFeed,
  getLatestFeedQueryOptions,
  getSidebar,
  getSidebarQueryOptions,
};
