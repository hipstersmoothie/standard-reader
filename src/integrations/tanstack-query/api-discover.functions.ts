import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAtprotoSessionForRequest } from "#/middleware/auth";
import { observe } from "#/server/observability/log";
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
import { z } from "zod";

import type { PublicationCard } from "./api-shapes";

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
  limit: z.number().int().min(1).max(60).default(12),
});

export interface TopicChip {
  topic: string;
  count: number;
}

export interface PublicationDirectoryPage {
  items: Array<PublicationCard>;
  nextOffset: number | null;
}

const getTopics = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(topicsInput)
  .handler(
    observe("discover.getTopics", async ({ data, context }, span) => {
      const { db } = context;
      const rows = await discoverPublicationTopics(db, data.limit);
      span.set("count", rows.length);
      return rows;
    }),
  );

const getKnownPublicationCount = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe(
      "discover.getKnownPublicationCount",
      async ({ context }, span) => {
        const count = await countKnownPublications(context.db);
        span.set("count", count);
        return count;
      },
    ),
  );

const getPublications = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(directoryInput)
  .handler(
    observe("discover.getPublications", async ({ data, context }, span) => {
      const { db, schema } = context;
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
  .inputValidator(railInput)
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
  .inputValidator(railInput)
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
          { excludeUris: trendingExclude },
        );
        span.set("count", items.length);
        return items.filter((pub) => pub.documentCount > 0);
      },
    ),
  );

const getFollowedByPeopleYouFollow = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(railInput)
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
          { excludeUris: trendingExclude },
        );
        span.set("count", items.length);
        return items;
      },
    ),
  );

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

export const discoverApi = {
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
};
