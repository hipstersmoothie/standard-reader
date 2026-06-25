import type { Span } from "#/server/observability/log";

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import {
  HOME_SCOPE_COOKIE,
  dbValueToHomeScope,
  parseHomeScope,
} from "#/lib/home-scope";
import {
  articleCardsAsAllRead,
  dbValueToTrackReadingHistory,
} from "#/lib/track-reading-history";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import {
  attachSubscribedLabels,
  filterHiddenDocuments,
  hiddenDocumentUris,
} from "#/server/labeler/labels.server";
import { observe } from "#/server/observability/log";
import { attachReaderSpanContext } from "#/server/observability/span-context.ts";
import { attachCommentCountsToArticles } from "#/server/reader/document-comments";
import {
  countFollowedDocuments,
  countNetworkDocuments,
  countTrendingDocuments,
  popularPublications,
  recommendedPublications,
  selectArticleCards,
  trendingArticles,
  trendingPublicationUris,
} from "#/server/reader/queries";
import { effectiveFollowUris } from "#/server/reader/saved-lists";
import { loadSidebarData } from "#/server/reader/shell-snapshot.server";
import { z } from "zod";

import type { ArticleCard, Db, PublicationCard, Schema } from "./api-shapes";

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
  /**
   * Unread count across follows. `null` on the critical path — loaded lazily via
   * {@link getHomeExtras} so the first paint is not blocked on a count scan.
   */
  unreadCount: number | null;
}

/**
 * Trending + You-might-follow rails. Unread masthead counts come from the
 * sidebar snapshot (`getShellBootstrap` / `getSidebar`), not this payload.
 */
export interface HomeFeedExtras {
  unreadCount: number | null;
  trending: Array<ArticleCard>;
  youMightFollow: Array<PublicationCard>;
}

export interface HomePageData {
  scope: HomeScope;
  feed: HomeFeed;
  extras: HomeFeedExtras;
}

const homePageInput = z.object({
  scope: z.enum(["follows", "network"]).optional(),
});

const homeExtrasInput = homeInput.extend({
  excludeUris: z.array(z.string()).max(100).default([]),
});

export interface LatestFeedCounts {
  /** Unread documents across the reader's subscriptions. */
  unread: number;
  /** All documents across the reader's subscriptions. */
  subscriptions: number;
  /** All discover-eligible documents across the network. */
  all: number;
  /** Articles in the trending candidate set. */
  trending: number;
}

export interface LatestFeed {
  items: Array<ArticleCard>;
  /**
   * Tab badges + masthead totals. `null` on the critical path — loaded lazily via
   * {@link getLatestFeedCounts} so the first paint is not blocked on count scans.
   */
  counts: LatestFeedCounts | null;
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

const getSidebar = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("feed.getSidebar", async ({ context }, span) => {
      const { db, schema, trackReadingEnabled } = context;
      const did = await attachReaderSpanContext(span, getRequest());

      const trackReading = did ? trackReadingEnabled : false;
      if (did) {
        span.set("did", did);
        const followUris = await effectiveFollowUris(db, schema, did);
        span.set("follows", followUris.length);
      }

      return loadSidebarData(db, schema, did, trackReading);
    }),
  );

async function resolveHomeFeedContext(
  db: Db,
  schema: Schema,
  did: string | null | undefined,
  scope: HomeScope,
  span: Span,
  {
    trackReading: trackReadingOverride,
    trackReadingEnabled,
  }: { trackReading?: boolean; trackReadingEnabled?: boolean } = {},
) {
  const trackReading =
    trackReadingOverride ?? (did ? (trackReadingEnabled ?? false) : false);

  const followUris = did ? await effectiveFollowUris(db, schema, did) : [];
  const hasFollows = followUris.length > 0;
  const personalized = hasFollows && scope === "follows";
  span.set("follows", followUris.length);
  span.set("scope", scope);
  span.set("personalized", personalized);

  const rowQuery = personalized
    ? {
        publicationUris: followUris,
        ...(trackReading && did ? { readForDid: did, unreadForDid: did } : {}),
      }
    : { discoverOnly: true };

  return {
    did,
    followUris,
    trackReading,
    hasFollows,
    personalized,
    rowQuery,
  };
}

type HomeFeedContext = Awaited<ReturnType<typeof resolveHomeFeedContext>>;

function homeExcludeUris(feed: Pick<HomeFeed, "featured" | "latestUnread">) {
  return [
    feed.featured?.uri,
    ...feed.latestUnread.map((article) => article.uri),
  ].filter((uri): uri is string => uri != null);
}

async function buildHomeFeedCritical(
  db: Db,
  schema: Schema,
  ctx: HomeFeedContext,
  span: Span,
): Promise<HomeFeed> {
  const { trackReading, hasFollows, personalized, rowQuery } = ctx;

  const [featuredLead, rows] = await Promise.all([
    selectArticleCards(db, schema, {
      ...rowQuery,
      featuredOnly: true,
      limit: 1,
    }),
    selectArticleCards(db, schema, {
      ...rowQuery,
      limit: HOME_ROW_LIMIT + 1,
    }),
  ]);

  let featured: ArticleCard | null = featuredLead[0] ?? rows[0] ?? null;
  let latestUnread = rows
    .filter((row) => row.uri !== featured?.uri)
    .slice(0, HOME_ROW_LIMIT);

  if (!trackReading || !personalized) {
    featured = featured ? { ...featured, isRead: true } : null;
    latestUnread = articleCardsAsAllRead(latestUnread);
  }

  // Drop anything the reader hid via a subscribed labeler's label.
  const hidden = await hiddenDocumentUris(db, schema, ctx.did, [
    ...(featured ? [featured.uri] : []),
    ...latestUnread.map((article) => article.uri),
  ]);
  if (hidden.size > 0) {
    if (featured && hidden.has(featured.uri)) featured = null;
    latestUnread = latestUnread.filter((article) => !hidden.has(article.uri));
  }

  span.set("rows", latestUnread.length);

  const withCounts = await attachCommentCountsToArticles(db, schema, [
    ...(featured ? [featured] : []),
    ...latestUnread,
  ]);
  const enriched = await attachSubscribedLabels(
    db,
    schema,
    ctx.did,
    withCounts,
  );
  const byUri = new Map(enriched.map((article) => [article.uri, article]));

  return {
    featured: featured ? (byUri.get(featured.uri) ?? featured) : null,
    latestUnread: latestUnread.map(
      (article) => byUri.get(article.uri) ?? article,
    ),
    trending: [],
    youMightFollow: [],
    personalized,
    hasFollows,
    unreadCount: null,
  } satisfies HomeFeed;
}

async function buildHomeFeedExtras(
  db: Db,
  schema: Schema,
  ctx: HomeFeedContext,
  excludeUris: ReadonlyArray<string>,
  span: Span,
  trendingRawPromise: ReturnType<typeof trendingArticles>,
  trendingPubUrisPromise: ReturnType<typeof trendingPublicationUris>,
): Promise<HomeFeedExtras> {
  const { personalized, did, followUris } = ctx;
  const exclude = new Set(excludeUris);

  const [trendingRaw, trendingPubUris] = await Promise.all([
    trendingRawPromise,
    trendingPubUrisPromise,
  ]);

  const trendingExcluded = trendingRaw.filter(
    (article) => !exclude.has(article.uri),
  );
  const trendingVisible = await filterHiddenDocuments(
    db,
    schema,
    did,
    trendingExcluded,
  );
  const trendingFiltered = trendingVisible.slice(0, HOME_RAIL_LIMIT);

  const [youMightFollowRaw, trending] = await Promise.all([
    personalized && did
      ? recommendedPublications(db, schema, did, HOME_RAIL_LIMIT, {
          excludeUris: trendingPubUris,
          followUris,
        })
      : popularPublications(db, schema, HOME_RAIL_LIMIT, trendingPubUris),
    attachCommentCountsToArticles(db, schema, trendingFiltered),
  ]);

  span.set("trending", trending.length);

  return {
    unreadCount: null,
    trending,
    youMightFollow: youMightFollowRaw,
  } satisfies HomeFeedExtras;
}

async function loadHomeFeedCritical(
  db: Db,
  schema: Schema,
  did: string | null | undefined,
  scope: HomeScope,
  span: Span,
  options: { trackReading?: boolean; trackReadingEnabled?: boolean } = {},
): Promise<HomeFeed> {
  const ctx = await resolveHomeFeedContext(
    db,
    schema,
    did,
    scope,
    span,
    options,
  );
  return buildHomeFeedCritical(db, schema, ctx, span);
}

async function loadHomeFeedExtras(
  db: Db,
  schema: Schema,
  did: string | null | undefined,
  scope: HomeScope,
  excludeUris: ReadonlyArray<string>,
  span: Span,
  options: { trackReading?: boolean; trackReadingEnabled?: boolean } = {},
): Promise<HomeFeedExtras> {
  const ctx = await resolveHomeFeedContext(
    db,
    schema,
    did,
    scope,
    span,
    options,
  );
  return buildHomeFeedExtras(
    db,
    schema,
    ctx,
    excludeUris,
    span,
    trendingArticles(db, schema, HOME_RAIL_LIMIT),
    trendingPublicationUris(db, schema, HOME_RAIL_LIMIT),
  );
}

/** Critical feed + rails in one request; trending queries overlap article fetches. */
async function loadHomePagePayload(
  db: Db,
  schema: Schema,
  did: string | null | undefined,
  scope: HomeScope,
  span: Span,
  options: { trackReading?: boolean; trackReadingEnabled?: boolean } = {},
): Promise<{ feed: HomeFeed; extras: HomeFeedExtras }> {
  const ctx = await resolveHomeFeedContext(
    db,
    schema,
    did,
    scope,
    span,
    options,
  );

  const trendingRawPromise = trendingArticles(db, schema, HOME_RAIL_LIMIT);
  const trendingPubUrisPromise = trendingPublicationUris(
    db,
    schema,
    HOME_RAIL_LIMIT,
  );

  const feed = await buildHomeFeedCritical(db, schema, ctx, span);
  const extras = await buildHomeFeedExtras(
    db,
    schema,
    ctx,
    homeExcludeUris(feed),
    span,
    trendingRawPromise,
    trendingPubUrisPromise,
  );

  return { feed, extras };
}

const getHomeFeed = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(homeInput)
  .handler(
    observe("feed.getHomeFeed", async ({ data, context }, span) => {
      const { db, schema, trackReadingEnabled } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      return loadHomeFeedCritical(db, schema, did, data.scope, span, {
        trackReadingEnabled,
      });
    }),
  );

/** Scope preference + home feed in one round trip for the route loader. */
const getHomePage = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(homePageInput)
  .handler(
    observe("feed.getHomePage", async ({ data, context }, span) => {
      const { db, schema } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      const authSession = did
        ? await getAtprotoSessionForRequest(getRequest())
        : undefined;

      let scope: HomeScope;
      if (authSession?.session.user) {
        scope =
          data.scope ??
          dbValueToHomeScope(authSession.session.user.homeScope ?? null);
      } else {
        scope = data.scope ?? parseHomeScope(getCookie(HOME_SCOPE_COOKIE));
      }

      const trackReading =
        authSession?.session.user == null
          ? undefined
          : dbValueToTrackReadingHistory(
              authSession.session.user.trackReadingHistory ?? null,
            );

      const { feed, extras } = await loadHomePagePayload(
        db,
        schema,
        did,
        scope,
        span,
        trackReading === undefined ? {} : { trackReading },
      );
      return { scope, feed, extras } satisfies HomePageData;
    }),
  );

/** Rails + unread badge — loaded after the critical feed paints. */
const getHomeExtras = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(homeExtrasInput)
  .handler(
    observe("feed.getHomeExtras", async ({ data, context }, span) => {
      const { db, schema, trackReadingEnabled } = context;
      const did = await attachReaderSpanContext(span, getRequest());

      return loadHomeFeedExtras(
        db,
        schema,
        did,
        data.scope,
        data.excludeUris,
        span,
        { trackReadingEnabled },
      );
    }),
  );

async function loadLatestFeedCritical(
  db: Db,
  schema: Schema,
  did: string | null | undefined,
  data: z.infer<typeof latestInput>,
  span: Span,
  trackReadingEnabled: boolean,
): Promise<LatestFeed> {
  span.set("filter", data.filter);
  span.set("offset", data.offset);

  const followUris = did ? await effectiveFollowUris(db, schema, did) : [];
  span.set("follows", followUris.length);
  const trackReading = did == null ? false : trackReadingEnabled;

  const trendingLimit =
    data.filter === "trending"
      ? Math.min(data.limit, TRENDING_PAGE_LIMIT - data.offset)
      : data.limit;

  const items =
    data.filter === "trending"
      ? trendingLimit > 0
        ? await trendingArticles(db, schema, trendingLimit, {
            offset: data.offset,
            readForDid: trackReading && did ? did : undefined,
            scope: "page",
          })
        : []
      : await selectArticleCards(db, schema, {
          ...(!did || data.filter === "all"
            ? { discoverOnly: true }
            : {
                publicationUris: followUris,
                unreadForDid:
                  trackReading && data.filter === "unread" ? did : undefined,
              }),
          readForDid: trackReading && did ? did : undefined,
          limit: data.limit,
          offset: data.offset,
        });

  span.set("count", items.length);
  // Hide labeled posts for the reader, but page on the pre-filter count so
  // pagination still advances (a page may just show slightly fewer rows).
  const visibleItems = await filterHiddenDocuments(db, schema, did, items);
  const enrichedItems = await attachCommentCountsToArticles(
    db,
    schema,
    trackReading ? visibleItems : articleCardsAsAllRead(visibleItems),
  );
  const labeledItems = await attachSubscribedLabels(
    db,
    schema,
    did,
    enrichedItems,
  );

  return {
    items: labeledItems,
    counts: null,
    nextOffset:
      data.filter === "trending"
        ? null
        : items.length === data.limit
          ? data.offset + data.limit
          : null,
  } satisfies LatestFeed;
}

async function loadLatestFeedCounts(
  db: Db,
  schema: Schema,
  did: string | null | undefined,
  span: Span,
  trackReadingEnabled: boolean,
): Promise<LatestFeedCounts> {
  const followUris = did ? await effectiveFollowUris(db, schema, did) : [];
  span.set("follows", followUris.length);
  const trackReading = did == null ? false : trackReadingEnabled;

  const [followCounts, networkCount, trendingCount] = await Promise.all([
    did
      ? countFollowedDocuments(db, schema, followUris, did)
      : Promise.resolve({ all: 0, unread: 0 }),
    countNetworkDocuments(db, schema),
    did ? countTrendingDocuments(db, schema, "rail") : Promise.resolve(0),
  ]);

  return {
    unread: trackReading ? followCounts.unread : 0,
    subscriptions: followCounts.all,
    all: networkCount,
    trending: trendingCount,
  } satisfies LatestFeedCounts;
}

const getLatestFeed = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(latestInput)
  .handler(
    observe("feed.getLatestFeed", async ({ data, context }, span) => {
      const { db, schema, trackReadingEnabled } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      return loadLatestFeedCritical(
        db,
        schema,
        did,
        data,
        span,
        trackReadingEnabled,
      );
    }),
  );

/** Tab badges + masthead totals — loaded after the critical latest feed paints. */
const getLatestFeedCounts = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("feed.getLatestFeedCounts", async ({ context }, span) => {
      const { db, schema, trackReadingEnabled } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      return loadLatestFeedCounts(db, schema, did, span, trackReadingEnabled);
    }),
  );

function getLatestFeedCountsQueryOptions() {
  return queryOptions({
    queryKey: ["feed", "latest", "counts"] as const,
    queryFn: async () => getLatestFeedCounts(),
    staleTime: 60_000,
  });
}

function getHomeFeedQueryOptions({
  scope = "follows",
}: z.input<typeof homeInput> = {}) {
  return queryOptions({
    queryKey: ["feed", "home", scope] as const,
    queryFn: async () => getHomeFeed({ data: { scope } }),
  });
}

function getHomeExtrasQueryOptions({
  scope = "follows",
  excludeUris = [],
}: z.input<typeof homeExtrasInput> = {}) {
  return queryOptions({
    queryKey: ["feed", "home", "extras", scope, excludeUris] as const,
    queryFn: async () => getHomeExtras({ data: { scope, excludeUris } }),
    staleTime: 60_000,
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
  getHomeExtras,
  getHomeExtrasQueryOptions,
  getHomePage,
  getLatestFeed,
  getLatestFeedCounts,
  getLatestFeedCountsQueryOptions,
  getLatestFeedQueryOptions,
  getSidebar,
  getSidebarQueryOptions,
};
