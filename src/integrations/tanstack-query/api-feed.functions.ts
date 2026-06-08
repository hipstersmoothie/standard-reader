import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAtprotoSessionForRequest } from "#/middleware/auth";
import { observe } from "#/server/observability/log";
import { attachCommentCountsToArticles } from "#/server/reader/document-comments";
import {
  countFollowedDocuments,
  followedPublications,
  popularPublications,
  recommendedPublications,
  selectArticleCards,
  selectFollowUris,
  trendingArticles,
  trendingPublicationUris,
} from "#/server/reader/queries";
import { z } from "zod";

import type { ArticleCard, PublicationCard } from "./api-shapes";

import { dbMiddleware } from "./db-middleware";

/**
 * Feed queries (`APP_VISION.md` §5): the signed-in reader's Home (featured lead
 * + latest unread + Trending/You-might-follow rails) and Latest (chronological
 * All/Unread with counts). Reads come from the Neon read-model; personal
 * unread-state is joined from the reader's own `reads`. Signed-out / cold-start
 * readers fall back to discover-eligible network content + popularity.
 */

const HOME_ROW_LIMIT = 8;
const HOME_RAIL_LIMIT = 6;

const latestInput = z.object({
  filter: z.enum(["all", "unread"]).default("all"),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});

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
  /** Unread count across follows (null when not personalized). */
  unreadCount: number | null;
}

export interface LatestFeed {
  items: Array<ArticleCard>;
  counts: { all: number; unread: number };
  /** Offset for the next page, or null when the last page was reached. */
  nextOffset: number | null;
}

export interface SidebarData {
  /** Whether the reader is signed in (drives empty-state copy + auth chrome). */
  signedIn: boolean;
  /** Followed publications (alphabetical) for the sidebar Following list. */
  following: Array<PublicationCard>;
  /** Unread count across follows (null when signed out / no follows). */
  unreadCount: number | null;
}

const getSidebar = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("feed.getSidebar", async ({ context }, span) => {
      const { db, schema } = context;
      const session = await getAtprotoSessionForRequest(getRequest());
      const did = session?.did;
      span.set("did", did ?? null);
      if (!did) {
        return {
          signedIn: false,
          following: [],
          unreadCount: null,
        } satisfies SidebarData;
      }

      const followUris = await selectFollowUris(db, schema, did);
      span.set("follows", followUris.length);
      const [following, counts] = await Promise.all([
        followedPublications(db, schema, followUris),
        followUris.length > 0
          ? countFollowedDocuments(db, schema, followUris, did)
          : Promise.resolve(null),
      ]);

      return {
        signedIn: true,
        following,
        unreadCount: counts?.unread ?? null,
      } satisfies SidebarData;
    }),
  );

const getHomeFeed = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("feed.getHomeFeed", async ({ context }, span) => {
      const { db, schema } = context;
      const session = await getAtprotoSessionForRequest(getRequest());
      const did = session?.did;
      const followUris = did ? await selectFollowUris(db, schema, did) : [];
      const personalized = followUris.length > 0;
      span.set("did", did ?? null);
      span.set("follows", followUris.length);
      span.set("personalized", personalized);

      const rowQuery = personalized
        ? { publicationUris: followUris, unreadForDid: did }
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
          trendingArticles(db, schema, HOME_RAIL_LIMIT + HOME_ROW_LIMIT),
          trendingPublicationUris(db, schema, HOME_RAIL_LIMIT),
          personalized && did
            ? countFollowedDocuments(db, schema, followUris, did)
            : Promise.resolve(null),
        ]);

      const youMightFollowRaw =
        personalized && did
          ? await recommendedPublications(db, schema, did, HOME_RAIL_LIMIT, {
              excludeUris: trendingPubUris,
            })
          : await popularPublications(
              db,
              schema,
              HOME_RAIL_LIMIT,
              trendingPubUris,
            );

      const featured = featuredLead[0] ?? rows[0] ?? null;
      const latestUnread = rows
        .filter((row) => row.uri !== featured?.uri)
        .slice(0, HOME_ROW_LIMIT);

      const excludeUris = new Set(
        [featured?.uri, ...latestUnread.map((row) => row.uri)].filter(
          (uri): uri is string => Boolean(uri),
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
        unreadCount: counts?.unread ?? null,
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

      const session = await getAtprotoSessionForRequest(getRequest());
      const did = session?.did;
      const followUris = did ? await selectFollowUris(db, schema, did) : [];
      if (!did || followUris.length === 0) {
        return {
          items: [],
          counts: { all: 0, unread: 0 },
          nextOffset: null,
        } satisfies LatestFeed;
      }
      span.set("did", did);

      const [items, counts] = await Promise.all([
        selectArticleCards(db, schema, {
          publicationUris: followUris,
          unreadForDid: data.filter === "unread" ? did : undefined,
          readForDid: did,
          limit: data.limit,
          offset: data.offset,
        }),
        countFollowedDocuments(db, schema, followUris, did),
      ]);

      span.set("count", items.length);
      const enrichedItems = await attachCommentCountsToArticles(
        db,
        schema,
        items,
      );
      return {
        items: enrichedItems,
        counts,
        nextOffset:
          items.length === data.limit ? data.offset + data.limit : null,
      } satisfies LatestFeed;
    }),
  );

function getHomeFeedQueryOptions() {
  return queryOptions({
    queryKey: ["feed", "home"] as const,
    queryFn: async () => getHomeFeed(),
  });
}

function getLatestFeedQueryOptions({
  filter = "all",
  limit = 20,
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
