import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { fetchBlueskyPublicProfileFields } from "#/lib/bluesky-public-profile";
import { resolveIdentity } from "#/server/atproto/identity";
import { resolveAuthorDid } from "#/server/atproto/resolve-author-ref";
import { resolveSifaProfileUrl } from "#/server/atproto/sifa-profile";
import { observe } from "#/server/observability/log";
import {
  authorLooseDocuments,
  authorProfileStats,
  authorPublications,
  authorRecommendations,
  authorSubscriptions,
} from "#/server/reader/queries";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type {
  ArticleCard,
  ProfileSummary,
  PublicationCard,
} from "./api-shapes";

import { dbMiddleware } from "./db-middleware";

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
  recommendations: Array<ArticleCard>;
  recommendationsNextOffset: number | null;
  documents: Array<ArticleCard>;
  documentsNextOffset: number | null;
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

        const [
          profile,
          stats,
          publications,
          subscriptionsPage,
          recommendationsPage,
          documentsPage,
        ] = await Promise.all([
          resolveAuthorProfile(db, schema, did),
          authorProfileStats(db, schema, did),
          authorPublications(db, schema, {
            did,
            limit: data.limit,
            offset: data.offset,
          }),
          authorSubscriptions(db, schema, {
            did,
            limit: data.activityLimit,
          }),
          authorRecommendations(db, schema, {
            did,
            limit: data.activityLimit,
          }),
          authorLooseDocuments(db, schema, {
            did,
            limit: data.activityLimit,
          }),
        ]);

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
            subscriptionsPage.items.length,
            subscriptionsPage.total,
          ),
          recommendations: recommendationsPage.items,
          recommendationsNextOffset: nextOffsetForPage(
            0,
            data.activityLimit,
            recommendationsPage.items.length,
            recommendationsPage.total,
          ),
          documents: documentsPage.items,
          documentsNextOffset: nextOffsetForPage(
            0,
            data.activityLimit,
            documentsPage.items.length,
            documentsPage.total,
          ),
        };
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

        const items = await authorPublications(db, schema, { ...data, did });
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

        const page = await authorRecommendations(db, schema, { ...data, did });
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

        const page = await authorLooseDocuments(db, schema, { ...data, did });
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
  getAuthorSifaProfile,
  getAuthorSifaProfileQueryOptions,
  getAuthorPublications,
  getAuthorSubscriptions,
  getAuthorSubscriptionsQueryOptions,
  getAuthorRecommendations,
  getAuthorRecommendationsQueryOptions,
  getAuthorDocuments,
  getAuthorDocumentsQueryOptions,
};
