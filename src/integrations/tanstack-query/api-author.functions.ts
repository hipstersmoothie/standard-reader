import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { fetchBlueskyPublicProfileFields } from "#/lib/bluesky-public-profile";
import type { HideableTabId } from "#/lib/profile-tabs";
import { parseHiddenTabs } from "#/lib/profile-tabs";
import { getReaderDidForRequest } from "#/middleware/auth-session.server";
import { resolveIdentity } from "#/server/atproto/identity";
import { resolveAuthorDid } from "#/server/atproto/resolve-author-ref";
import { resolveSifaProfileUrl } from "#/server/atproto/sifa-profile";
import { observe } from "#/server/observability/log";
import {
  authorDocuments,
  authorProfileStats,
  authorPublications,
  authorReaders,
  authorRecommendations,
  authorSubscriptions,
} from "#/server/reader/queries";
import type { AuthorProfileStats, AuthorReader } from "#/server/reader/queries";
import { attachRecommendedByToArticles } from "#/server/reader/recommended-by";
import { effectiveFollowSets } from "#/server/reader/saved-lists";

import type {
  ArticleCard,
  Db,
  ProfileSummary,
  PublicationCard,
  Schema,
} from "./api-shapes";
import { dbMiddleware } from "./db-middleware";

export type { AuthorReader };

/**
 * Author profile queries — identity from `profiles` (backfilled from AT Proto
 * identity + Bluesky `app.bsky.actor.profile`), owned publications, and public
 * graph activity (`site.standard.graph.subscription` / `recommend`).
 */

export const AUTHOR_ACTIVITY_PAGE_SIZE = 12;

const authorInput = z.object({
  did: z.string().min(1),
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
  activityLimit: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(AUTHOR_ACTIVITY_PAGE_SIZE),
});

const authorPublicationsInput = z.object({
  did: z.string().min(1),
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
});

const authorActivityInput = z.object({
  did: z.string().min(1),
  limit: z.number().int().min(1).max(30).default(AUTHOR_ACTIVITY_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
});

const authorSifaInput = z.object({
  did: z.string().min(1),
  handle: z.string().nullable().optional(),
});

const authorSummaryInput = z.object({
  did: z.string().min(1),
});

/**
 * The cheap slice of {@link AuthorProfile} a hovercard needs: identity +
 * aggregate counts, without the five activity pages `getAuthorProfile` fans out
 * to. Both halves reuse the same helpers the full profile does.
 */
export interface AuthorSummary {
  profile: ProfileSummary;
  stats: AuthorProfileStats;
}

export interface AuthorProfile {
  profile: ProfileSummary;
  stats: {
    publicationCount: number;
    documentCount: number;
    subscriberCount: number;
    subscriptionCount: number;
    recommendationCount: number;
  };
  publications: Array<PublicationCard>;
  publicationsNextOffset: number | null;
  subscriptions: Array<PublicationCard>;
  subscriptionsNextOffset: number | null;
  readers: Array<AuthorReader>;
  readersNextOffset: number | null;
  recommendations: Array<ArticleCard>;
  recommendationsNextOffset: number | null;
  documents: Array<ArticleCard>;
  documentsNextOffset: number | null;
  /** Default-visible tab ids the profile owner has hidden from their profile. */
  hiddenTabs: Array<HideableTabId>;
  /** Whether the opt-in "Recommendations" tab is enabled on this profile. */
  showLikes: boolean;
}

export interface AuthorPublicationsPage {
  items: Array<PublicationCard>;
  nextOffset: number | null;
}

export interface AuthorSubscriptionsPage {
  items: Array<PublicationCard>;
  nextOffset: number | null;
}

export interface AuthorRecommendationsPage {
  items: Array<ArticleCard>;
  nextOffset: number | null;
}

export interface AuthorReadersPage {
  items: Array<AuthorReader>;
  nextOffset: number | null;
}

export interface AuthorDocumentsPage {
  items: Array<ArticleCard>;
  nextOffset: number | null;
}

async function resolveAuthorProfile(
  db: Parameters<typeof authorPublications>[0],
  schema: Parameters<typeof authorPublications>[1],
  did: string,
): Promise<ProfileSummary> {
  const pr = schema.profiles;
  const [row] = await db
    .select({
      did: pr.did,
      handle: pr.handle,
      displayName: pr.displayName,
      description: pr.description,
      avatarUrl: pr.avatarUrl,
      bannerUrl: pr.bannerUrl,
    })
    .from(pr)
    .where(eq(pr.did, did))
    .limit(1);

  if (row) {
    const [identity, publicProfile] = await Promise.all([
      row.handle ? Promise.resolve(null) : resolveIdentity(did),
      !row.displayName || !row.avatarUrl
        ? fetchBlueskyPublicProfileFields(did)
        : Promise.resolve(null),
    ]);

    return {
      did: row.did,
      handle: row.handle ?? identity?.handle ?? publicProfile?.handle ?? null,
      displayName: row.displayName ?? publicProfile?.displayName ?? null,
      description: row.description,
      avatarUrl: row.avatarUrl ?? publicProfile?.avatarUrl ?? null,
      bannerUrl: row.bannerUrl,
    };
  }

  const [identity, publicProfile] = await Promise.all([
    resolveIdentity(did),
    fetchBlueskyPublicProfileFields(did),
  ]);

  return {
    did,
    handle: identity.handle ?? publicProfile?.handle ?? null,
    displayName: publicProfile?.displayName ?? null,
    description: null,
    avatarUrl: publicProfile?.avatarUrl ?? null,
    bannerUrl: null,
  };
}

function nextOffsetForPage(
  offset: number,
  limit: number,
  fetched: number,
  total: number,
): number | null {
  const next = offset + fetched;
  return next < total && fetched === limit ? next : null;
}

/**
 * "Recommended by @follow" attribution for the *viewing* reader — the same
 * signal shown on the feeds. Resolves the viewer's effective follow set and
 * attaches it to the cards; a no-op (no query) when signed out or following no
 * one. `excludeDid` drops one recommender: on a profile's Likes tab the cards
 * are already framed as that profile's recommendations, so surfacing
 * "Recommended by <that profile>" would be redundant — pass the profile owner
 * to keep only *other* follows.
 */
async function attachViewerRecommendedBy(
  db: Db,
  schema: Schema,
  viewerDid: string | null | undefined,
  articles: Array<ArticleCard>,
  excludeDid?: string | null,
): Promise<Array<ArticleCard>> {
  if (!viewerDid || articles.length === 0) return articles;
  const { userDids } = await effectiveFollowSets(db, schema, viewerDid);
  const followedUserDids = excludeDid
    ? userDids.filter((recommender) => recommender !== excludeDid)
    : userDids;
  return attachRecommendedByToArticles(db, schema, followedUserDids, articles);
}

const getAuthorProfile = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(authorInput)
  .handler(
    observe(
      "author.getProfile",
      async ({ data, context }, span): Promise<AuthorProfile | null> => {
        const { db, schema } = context;
        const did = await resolveAuthorDid(db, schema, data.did);
        span.set("did", did);
        span.set("offset", data.offset);

        // Only the owner viewing their own profile sees pubs that opted out of
        // discovery — dimmed + labeled. Everyone else gets them filtered out.
        const viewerDid = await getReaderDidForRequest(getRequest());
        const includeHidden = viewerDid != null && viewerDid === did;
        span.set("ownProfile", includeHidden);

        const [
          profile,
          stats,
          publications,
          subscriptionsPage,
          readersPage,
          recommendationsPage,
          documentsPage,
          ownerRow,
        ] = await Promise.all([
          resolveAuthorProfile(db, schema, did),
          authorProfileStats(db, schema, did),
          authorPublications(db, schema, {
            did,
            limit: data.limit,
            offset: data.offset,
            includeHidden,
          }),
          authorSubscriptions(db, schema, {
            did,
            limit: data.activityLimit,
          }),
          authorReaders(db, schema, {
            did,
            limit: data.activityLimit,
          }),
          authorRecommendations(db, schema, {
            did,
            limit: data.activityLimit,
          }),
          authorDocuments(db, schema, {
            did,
            limit: data.activityLimit,
          }),
          // The tab-visibility settings live on the owner's `user` row (keyed by
          // DID), independent of who is viewing the profile.
          db.query.user.findFirst({
            where: eq(schema.user.did, did),
            columns: { profileHiddenTabs: true, profileShowLikes: true },
          }),
        ]);

        const hiddenTabs = parseHiddenTabs(ownerRow?.profileHiddenTabs ?? null);
        const showLikes = ownerRow?.profileShowLikes === true;

        const hasIdentity =
          profile.handle != null ||
          profile.displayName != null ||
          profile.description != null ||
          profile.avatarUrl != null ||
          stats.publicationCount > 0 ||
          stats.subscriptionCount > 0 ||
          stats.recommendationCount > 0 ||
          documentsPage.total > 0;

        if (!hasIdentity) {
          span.set("found", false);
          return null;
        }

        span.set("found", true);
        span.set("publicationCount", publications.length);
        span.set("subscriptionCount", subscriptionsPage.items.length);
        span.set("recommendationCount", recommendationsPage.items.length);
        span.set("documentCount", documentsPage.items.length);

        // "Recommended by @follow" for the viewer. Writing = this author's own
        // posts (self-recommends are already excluded by the helper); Likes =
        // posts this author recommended, so drop the author from the attribution
        // to avoid the redundant "Recommended by <this profile>".
        const [documentsWithRecs, recommendationsWithRecs] = await Promise.all([
          attachViewerRecommendedBy(db, schema, viewerDid, documentsPage.items),
          attachViewerRecommendedBy(
            db,
            schema,
            viewerDid,
            recommendationsPage.items,
            did,
          ),
        ]);

        return {
          profile,
          stats,
          publications,
          publicationsNextOffset:
            publications.length === data.limit
              ? data.offset + data.limit
              : null,
          subscriptions: subscriptionsPage.items,
          subscriptionsNextOffset: nextOffsetForPage(
            0,
            data.activityLimit,
            subscriptionsPage.fetchedCount,
            subscriptionsPage.total,
          ),
          readers: readersPage.items,
          readersNextOffset: nextOffsetForPage(
            0,
            data.activityLimit,
            readersPage.items.length,
            readersPage.total,
          ),
          recommendations: recommendationsWithRecs,
          recommendationsNextOffset: nextOffsetForPage(
            0,
            data.activityLimit,
            recommendationsPage.items.length,
            recommendationsPage.total,
          ),
          documents: documentsWithRecs,
          documentsNextOffset: nextOffsetForPage(
            0,
            data.activityLimit,
            documentsPage.items.length,
            documentsPage.total,
          ),
          hiddenTabs,
          showLikes,
        };
      },
    ),
  );

/**
 * Lightweight author summary for inline mention hovercards — identity +
 * aggregate counts only, so a card that appears on hover doesn't pay for the
 * full profile's activity pages. Returns `null` when the DID resolves to no
 * indexed identity or writing.
 */
const getAuthorSummary = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(authorSummaryInput)
  .handler(
    observe(
      "author.getSummary",
      async ({ data, context }, span): Promise<AuthorSummary | null> => {
        const { db, schema } = context;
        const did = await resolveAuthorDid(db, schema, data.did);
        span.set("did", did);

        const [profile, stats] = await Promise.all([
          resolveAuthorProfile(db, schema, did),
          authorProfileStats(db, schema, did),
        ]);

        const hasIdentity =
          profile.handle != null ||
          profile.displayName != null ||
          profile.description != null ||
          profile.avatarUrl != null ||
          stats.publicationCount > 0 ||
          stats.documentCount > 0 ||
          stats.subscriptionCount > 0 ||
          stats.recommendationCount > 0;

        if (!hasIdentity) {
          span.set("found", false);
          return null;
        }

        span.set("found", true);
        return { profile, stats };
      },
    ),
  );

const getAuthorSifaProfile = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(authorSifaInput)
  .handler(
    observe(
      "author.getSifaProfile",
      async ({ data, context }, span): Promise<string | null> => {
        const { db, schema } = context;
        const did = await resolveAuthorDid(db, schema, data.did);
        span.set("did", did);

        const url = await resolveSifaProfileUrl(did, data.handle ?? null);
        span.set("found", url != null);
        return url;
      },
    ),
  );

const getAuthorPublications = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(authorPublicationsInput)
  .handler(
    observe(
      "author.getPublications",
      async ({ data, context }, span): Promise<AuthorPublicationsPage> => {
        const { db, schema } = context;
        const did = await resolveAuthorDid(db, schema, data.did);
        span.set("did", did);
        span.set("offset", data.offset);

        // Match getProfile: the owner sees their own hidden pubs (dimmed), so
        // paginating must keep including them; other viewers never see them.
        const viewerDid = await getReaderDidForRequest(getRequest());
        const includeHidden = viewerDid != null && viewerDid === did;
        span.set("ownProfile", includeHidden);

        const items = await authorPublications(db, schema, {
          ...data,
          did,
          includeHidden,
        });
        span.set("count", items.length);

        return {
          items,
          nextOffset:
            items.length === data.limit ? data.offset + data.limit : null,
        };
      },
    ),
  );

const getAuthorSubscriptions = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(authorActivityInput)
  .handler(
    observe(
      "author.getSubscriptions",
      async ({ data, context }, span): Promise<AuthorSubscriptionsPage> => {
        const { db, schema } = context;
        const did = await resolveAuthorDid(db, schema, data.did);
        span.set("did", did);
        span.set("offset", data.offset);

        const page = await authorSubscriptions(db, schema, { ...data, did });
        span.set("count", page.items.length);

        return {
          items: page.items,
          nextOffset: nextOffsetForPage(
            data.offset,
            data.limit,
            page.fetchedCount,
            page.total,
          ),
        };
      },
    ),
  );

const getAuthorReaders = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(authorActivityInput)
  .handler(
    observe(
      "author.getReaders",
      async ({ data, context }, span): Promise<AuthorReadersPage> => {
        const { db, schema } = context;
        const did = await resolveAuthorDid(db, schema, data.did);
        span.set("did", did);
        span.set("offset", data.offset);

        const page = await authorReaders(db, schema, { ...data, did });
        span.set("count", page.items.length);

        return {
          items: page.items,
          nextOffset: nextOffsetForPage(
            data.offset,
            data.limit,
            page.items.length,
            page.total,
          ),
        };
      },
    ),
  );

const getAuthorRecommendations = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(authorActivityInput)
  .handler(
    observe(
      "author.getRecommendations",
      async ({ data, context }, span): Promise<AuthorRecommendationsPage> => {
        const { db, schema } = context;
        const did = await resolveAuthorDid(db, schema, data.did);
        span.set("did", did);
        span.set("offset", data.offset);

        // Resolve the page and the viewer identity together — the follow-set
        // lookup only needs the viewer's DID, not the page rows.
        const [page, viewerDid] = await Promise.all([
          authorRecommendations(db, schema, { ...data, did }),
          getReaderDidForRequest(getRequest()),
        ]);
        span.set("count", page.items.length);

        // Likes tab: exclude the profile owner from the attribution (see
        // {@link attachViewerRecommendedBy}).
        const items = await attachViewerRecommendedBy(
          db,
          schema,
          viewerDid,
          page.items,
          did,
        );

        return {
          items,
          nextOffset: nextOffsetForPage(
            data.offset,
            data.limit,
            page.items.length,
            page.total,
          ),
        };
      },
    ),
  );

const getAuthorDocuments = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(authorActivityInput)
  .handler(
    observe(
      "author.getDocuments",
      async ({ data, context }, span): Promise<AuthorDocumentsPage> => {
        const { db, schema } = context;
        const did = await resolveAuthorDid(db, schema, data.did);
        span.set("did", did);
        span.set("offset", data.offset);

        // Resolve the page and the viewer identity together — the follow-set
        // lookup only needs the viewer's DID, not the page rows.
        const [page, viewerDid] = await Promise.all([
          authorDocuments(db, schema, { ...data, did }),
          getReaderDidForRequest(getRequest()),
        ]);
        span.set("count", page.items.length);

        // Writing tab: this author's own posts — the helper already drops
        // self-recommends, so no owner exclusion needed here.
        const items = await attachViewerRecommendedBy(
          db,
          schema,
          viewerDid,
          page.items,
        );

        return {
          items,
          nextOffset: nextOffsetForPage(
            data.offset,
            data.limit,
            page.items.length,
            page.total,
          ),
        };
      },
    ),
  );

function getAuthorProfileQueryOptions(
  did: string,
  {
    limit = 24,
    offset = 0,
    activityLimit = AUTHOR_ACTIVITY_PAGE_SIZE,
  }: {
    limit?: number;
    offset?: number;
    activityLimit?: number;
  } = {},
) {
  return queryOptions({
    queryKey: ["author", "profile", did, limit, offset, activityLimit] as const,
    queryFn: async () =>
      getAuthorProfile({ data: { did, limit, offset, activityLimit } }),
  });
}

function getAuthorSummaryQueryOptions(did: string) {
  return queryOptions({
    queryKey: ["author", "summary", did] as const,
    queryFn: async () => getAuthorSummary({ data: { did } }),
    staleTime: 300_000,
  });
}

function getAuthorSifaProfileQueryOptions(did: string, handle: string | null) {
  return queryOptions({
    queryKey: ["author", "sifa", did, handle] as const,
    queryFn: async () => getAuthorSifaProfile({ data: { did, handle } }),
    staleTime: 300_000,
  });
}

function getAuthorSubscriptionsQueryOptions(
  did: string,
  {
    limit = AUTHOR_ACTIVITY_PAGE_SIZE,
    offset = 0,
  }: { limit?: number; offset?: number } = {},
) {
  return queryOptions({
    queryKey: ["author", "subscriptions", did, limit, offset] as const,
    queryFn: async () =>
      getAuthorSubscriptions({ data: { did, limit, offset } }),
  });
}

function getAuthorReadersQueryOptions(
  did: string,
  {
    limit = AUTHOR_ACTIVITY_PAGE_SIZE,
    offset = 0,
  }: { limit?: number; offset?: number } = {},
) {
  return queryOptions({
    queryKey: ["author", "readers", did, limit, offset] as const,
    queryFn: async () => getAuthorReaders({ data: { did, limit, offset } }),
  });
}

function getAuthorRecommendationsQueryOptions(
  did: string,
  {
    limit = AUTHOR_ACTIVITY_PAGE_SIZE,
    offset = 0,
  }: { limit?: number; offset?: number } = {},
) {
  return queryOptions({
    queryKey: ["author", "recommendations", did, limit, offset] as const,
    queryFn: async () =>
      getAuthorRecommendations({ data: { did, limit, offset } }),
  });
}

function getAuthorDocumentsQueryOptions(
  did: string,
  {
    limit = AUTHOR_ACTIVITY_PAGE_SIZE,
    offset = 0,
  }: { limit?: number; offset?: number } = {},
) {
  return queryOptions({
    queryKey: ["author", "documents", did, limit, offset] as const,
    queryFn: async () => getAuthorDocuments({ data: { did, limit, offset } }),
  });
}

export const authorApi = {
  getAuthorProfile,
  getAuthorProfileQueryOptions,
  getAuthorSummary,
  getAuthorSummaryQueryOptions,
  getAuthorSifaProfile,
  getAuthorSifaProfileQueryOptions,
  getAuthorPublications,
  getAuthorSubscriptions,
  getAuthorSubscriptionsQueryOptions,
  getAuthorReaders,
  getAuthorReadersQueryOptions,
  getAuthorRecommendations,
  getAuthorRecommendationsQueryOptions,
  getAuthorDocuments,
  getAuthorDocumentsQueryOptions,
};
