import type { Span } from "#/server/observability/log";

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import { observe } from "#/server/observability/log";
import { attachReaderSpanContext } from "#/server/observability/span-context.ts";
import {
  countKnownPublications,
  discoverDirectoryPublications,
  discoverPublicationTopics,
  followedByPeopleYouFollow,
  popularPublications,
  recommendedPublications,
  trendingPublicationUris,
  trendingPublications,
} from "#/server/reader/queries";
import { effectiveFollowUris } from "#/server/reader/saved-lists";
import { z } from "zod";

import type { Db, PublicationCard, Schema } from "./api-shapes";

import { dbMiddleware } from "./db-middleware";

/**
 * Discover directory queries (`APP_VISION.md` §5): the topic chips, the full
 * "All publications" directory (topic filter + Readers/Active/A–Z sort +
 * pagination), and the Trending / Recommended rails. All reads come from the
 * Neon read-model + precomputed aggregates.
 */

const directorySort = z.enum(["readers", "active", "az"]);

export const DISCOVER_TOPICS_LIMIT = 50;

const topicsInput = z.object({
  limit: z.number().int().min(1).max(100).default(DISCOVER_TOPICS_LIMIT),
});

const directoryInput = z.object({
  topic: z.string().min(1).nullish(),
  sort: directorySort.default("readers"),
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
  q: z.string().trim().min(1).max(120).optional(),
});

const railInput = z.object({
  limit: z.number().int().min(1).max(100).default(12),
});

export interface TopicChip {
  topic: string;
  count: number;
}

export interface PublicationDirectoryPage {
  items: Array<PublicationCard>;
  nextOffset: number | null;
}

/** Masthead count + above-the-fold rails — deferred after shell paints. */
export interface DiscoverExtras {
  knownPublicationCount: number;
  recommended: Array<PublicationCard>;
  followedBy: Array<PublicationCard>;
}

const discoverExtrasInput = z.object({
  recommendedLimit: z.number().int().min(1).max(100).default(12),
  socialProofLimit: z.number().int().min(1).max(100).default(12),
});

async function loadRecommendedRail(
  db: Db,
  schema: Schema,
  did: string | null | undefined,
  limit: number,
  trendingExclude: Array<string>,
  followUris: Array<string>,
): Promise<Array<PublicationCard>> {
  const items =
    did == null
      ? await popularPublications(db, schema, limit, trendingExclude)
      : await recommendedPublications(db, schema, did, limit, {
          excludeUris: trendingExclude,
          followUris,
        });
  return items.filter((pub) => pub.documentCount > 0);
}

async function loadDiscoverExtras(
  db: Db,
  schema: Schema,
  did: string | null | undefined,
  { recommendedLimit, socialProofLimit }: z.infer<typeof discoverExtrasInput>,
  span: Span,
): Promise<DiscoverExtras> {
  const trendingLimit = Math.max(recommendedLimit, socialProofLimit);
  span.set("personalized", did != null);
  if (did) {
    span.set("did", did);
  }

  const [knownPublicationCount, trendingExclude, followUris] =
    await Promise.all([
      countKnownPublications(db),
      trendingPublicationUris(db, schema, trendingLimit),
      did ? effectiveFollowUris(db, schema, did) : Promise.resolve([]),
    ]);

  span.set("trendingExclude", trendingExclude.length);

  const [recommended, followedBy] = await Promise.all([
    loadRecommendedRail(
      db,
      schema,
      did,
      recommendedLimit,
      trendingExclude,
      followUris,
    ),
    did
      ? followedByPeopleYouFollow(db, schema, did, socialProofLimit, {
          excludeUris: trendingExclude,
          followUris,
        })
      : Promise.resolve([]),
  ]);

  span.set("recommended", recommended.length);
  span.set("followedBy", followedBy.length);

  return {
    knownPublicationCount,
    recommended,
    followedBy,
  } satisfies DiscoverExtras;
}

const getTopics = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(topicsInput)
  .handler(
    observe("discover.getTopics", async ({ data, context }, span) => {
      const { db } = context;
      await attachReaderSpanContext(span, getRequest());
      const rows = await discoverPublicationTopics(db, data.limit);
      span.set("count", rows.length);
      return rows;
    }),
  );

const getKnownPublicationCount = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("discover.getKnownPublicationCount", async ({ context }, span) => {
      await attachReaderSpanContext(span, getRequest());
      const count = await countKnownPublications(context.db);
      span.set("count", count);
      return count;
    }),
  );

/** Masthead count + rails — loaded after the discover shell paints. */
const getDiscoverExtras = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(discoverExtrasInput)
  .handler(
    observe("discover.getDiscoverExtras", async ({ data, context }, span) => {
      const { db, schema } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      return loadDiscoverExtras(db, schema, did, data, span);
    }),
  );

const getPublications = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(directoryInput)
  .handler(
    observe("discover.getPublications", async ({ data, context }, span) => {
      const { db, schema } = context;
      await attachReaderSpanContext(span, getRequest());
      span.set("topic", data.topic ?? null);
      span.set("sort", data.sort);
      span.set("offset", data.offset);
      span.set("q", data.q ?? null);

      const items = await discoverDirectoryPublications(db, schema, {
        topic: data.topic ?? null,
        sort: data.sort,
        limit: data.limit,
        offset: data.offset,
        query: data.q ?? null,
      });

      span.set("count", items.length);
      return {
        items,
        nextOffset:
          items.length === data.limit ? data.offset + data.limit : null,
      } satisfies PublicationDirectoryPage;
    }),
  );

const getTrendingPublications = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(railInput)
  .handler(
    observe(
      "discover.getTrendingPublications",
      async ({ data, context }, span) => {
        const { db, schema } = context;
        const items = await trendingPublications(db, schema, data.limit);
        span.set("count", items.length);
        return items;
      },
    ),
  );

const getRecommendedPublications = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(railInput)
  .handler(
    observe(
      "discover.getRecommendedPublications",
      async ({ data, context }, span) => {
        const { db, schema } = context;
        const trendingExclude = await trendingPublicationUris(
          db,
          schema,
          data.limit,
        );
        span.set("trendingExclude", trendingExclude.length);

        const session = await getAtprotoSessionForRequest(getRequest());
        if (!session) {
          span.set("personalized", false);
          const items = await popularPublications(
            db,
            schema,
            data.limit,
            trendingExclude,
          );
          span.set("count", items.length);
          return items.filter((pub) => pub.documentCount > 0);
        }
        span.set("did", session.did);
        span.set("personalized", true);
        const items = await recommendedPublications(
          db,
          schema,
          session.did,
          data.limit,
          {
            excludeUris: trendingExclude,
            followUris: await effectiveFollowUris(db, schema, session.did),
          },
        );
        span.set("count", items.length);
        return items.filter((pub) => pub.documentCount > 0);
      },
    ),
  );

const getEffectiveFollowUris = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("discover.getEffectiveFollowUris", async ({ context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        span.set("count", 0);
        return [];
      }
      span.set("did", session.did);
      const uris = await effectiveFollowUris(
        context.db,
        context.schema,
        session.did,
      );
      span.set("count", uris.length);
      return uris;
    }),
  );

const getFollowedByPeopleYouFollow = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(railInput)
  .handler(
    observe(
      "discover.getFollowedByPeopleYouFollow",
      async ({ data, context }, span) => {
        const { db, schema } = context;
        const session = await getAtprotoSessionForRequest(getRequest());
        if (!session) {
          span.set("count", 0);
          return [];
        }
        span.set("did", session.did);
        const trendingExclude = await trendingPublicationUris(
          db,
          schema,
          data.limit,
        );
        span.set("trendingExclude", trendingExclude.length);
        const items = await followedByPeopleYouFollow(
          db,
          schema,
          session.did,
          data.limit,
          {
            excludeUris: trendingExclude,
            followUris: await effectiveFollowUris(db, schema, session.did),
          },
        );
        span.set("count", items.length);
        return items;
      },
    ),
  );

function getDiscoverExtrasQueryOptions({
  recommendedLimit = 12,
  socialProofLimit = 12,
}: z.input<typeof discoverExtrasInput> = {}) {
  return queryOptions({
    queryKey: [
      "discover",
      "extras",
      recommendedLimit,
      socialProofLimit,
    ] as const,
    queryFn: async () =>
      getDiscoverExtras({ data: { recommendedLimit, socialProofLimit } }),
    staleTime: 60_000,
  });
}

function getKnownPublicationCountQueryOptions() {
  return queryOptions({
    queryKey: ["discover", "known-count"] as const,
    queryFn: async () => getKnownPublicationCount(),
  });
}

function getTopicsQueryOptions({
  limit = DISCOVER_TOPICS_LIMIT,
}: { limit?: number } = {}) {
  return queryOptions({
    queryKey: ["discover", "topics", limit] as const,
    queryFn: async () => getTopics({ data: { limit } }),
  });
}

function getPublicationsQueryOptions({
  topic = null,
  sort = "readers",
  limit = 24,
  offset = 0,
  q,
}: z.input<typeof directoryInput> = {}) {
  return queryOptions({
    queryKey: [
      "discover",
      "publications",
      topic,
      sort,
      limit,
      offset,
      q ?? "",
    ] as const,
    queryFn: async () =>
      getPublications({ data: { topic, sort, limit, offset, q } }),
  });
}

function getTrendingPublicationsQueryOptions({
  limit = 12,
}: { limit?: number } = {}) {
  return queryOptions({
    queryKey: ["discover", "trending", limit] as const,
    queryFn: async () => getTrendingPublications({ data: { limit } }),
  });
}

function getRecommendedPublicationsQueryOptions({
  limit = 12,
}: { limit?: number } = {}) {
  return queryOptions({
    queryKey: ["discover", "recommended", limit] as const,
    queryFn: async () => getRecommendedPublications({ data: { limit } }),
  });
}

function getFollowedByPeopleYouFollowQueryOptions({
  limit = 12,
}: { limit?: number } = {}) {
  return queryOptions({
    queryKey: ["discover", "followed-by", limit] as const,
    queryFn: async () => getFollowedByPeopleYouFollow({ data: { limit } }),
  });
}

function getEffectiveFollowUrisQueryOptions() {
  return queryOptions({
    queryKey: ["discover", "effectiveFollowUris"] as const,
    queryFn: async () => getEffectiveFollowUris(),
  });
}

export const discoverApi = {
  getDiscoverExtras,
  getDiscoverExtrasQueryOptions,
  getKnownPublicationCount,
  getKnownPublicationCountQueryOptions,
  getTopics,
  getTopicsQueryOptions,
  getPublications,
  getPublicationsQueryOptions,
  getTrendingPublications,
  getTrendingPublicationsQueryOptions,
  getRecommendedPublications,
  getRecommendedPublicationsQueryOptions,
  getFollowedByPeopleYouFollow,
  getFollowedByPeopleYouFollowQueryOptions,
  getEffectiveFollowUris,
  getEffectiveFollowUrisQueryOptions,
};
