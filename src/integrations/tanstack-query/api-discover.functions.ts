import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import type { Span } from "#/server/observability/log";
import { observe } from "#/server/observability/log";
import { attachReaderSpanContext } from "#/server/observability/span-context.ts";
import {
  EMPTY_FRIEND_ARTICLES,
  EMPTY_FRIEND_PEOPLE,
  EMPTY_FRIEND_PUBLISHERS,
  FRIEND_ARTICLE_PAGE_SIZE,
  FRIEND_PAGE_SIZE,
  FRIEND_PEOPLE_PAGE_SIZE,
  friendArticles,
  friendPeople,
  friendPublishers,
} from "#/server/reader/bsky-friends";
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
import { rotationSeed } from "#/server/reader/rail-rotation";
import { effectiveFollowUris } from "#/server/reader/saved-lists";

import type { Db, PublicationCard, Schema } from "./api-shapes";
import { dbMiddleware } from "./db-middleware";

export type {
  FriendArticles,
  FriendAuthor,
  FriendPeople,
  FriendPerson,
  FriendPublishers,
} from "#/server/reader/bsky-friends";

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
      ? await popularPublications(
          db,
          schema,
          limit,
          trendingExclude,
          rotationSeed("discover", "anon"),
        )
      : await recommendedPublications(db, schema, did, limit, {
          excludeUris: trendingExclude,
          followUris,
          seed: rotationSeed("discover", did),
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
          seed: rotationSeed("discover-followed-by", did),
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

/**
 * Publications written by the Bluesky accounts you follow. Signed-out readers
 * get the empty shape rather than an error — the surfaces that use it are
 * hidden when there's nobody to show.
 */
const friendPublishersInput = z.object({
  limit: z.number().int().min(1).max(50).default(FRIEND_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
});

const friendArticlesInput = z.object({
  limit: z.number().int().min(1).max(50).default(FRIEND_ARTICLE_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
});

const friendPeopleInput = z.object({
  limit: z.number().int().min(1).max(50).default(FRIEND_PEOPLE_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
});

const getFriendPublishers = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(friendPublishersInput)
  .handler(
    observe("discover.getFriendPublishers", async ({ data, context }, span) => {
      const { db, schema } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      if (!did) {
        span.set("signedIn", false);
        return EMPTY_FRIEND_PUBLISHERS;
      }
      span.set("signedIn", true);
      span.set("offset", data.offset);

      const result = await friendPublishers(db, schema, did, {
        limit: data.limit,
        offset: data.offset,
      });
      span.set("people", result.totalPeople);
      span.set("publications", result.publicationCount);
      span.set("degraded", result.degraded);
      span.set("truncated", result.truncated);
      return result;
    }),
  );

/** The Articles tab of `/friends`: recent writing from those publications. */
const getFriendArticles = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(friendArticlesInput)
  .handler(
    observe("discover.getFriendArticles", async ({ data, context }, span) => {
      const { db, schema } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      if (!did) {
        span.set("signedIn", false);
        return EMPTY_FRIEND_ARTICLES;
      }
      span.set("signedIn", true);
      span.set("offset", data.offset);

      const result = await friendArticles(db, schema, did, {
        limit: data.limit,
        offset: data.offset,
      });
      span.set("count", result.items.length);
      span.set("degraded", result.degraded);
      return result;
    }),
  );

/** The People tab of `/friends`: the distinct writers behind those pubs. */
const getFriendPeople = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(friendPeopleInput)
  .handler(
    observe("discover.getFriendPeople", async ({ data, context }, span) => {
      const { db, schema } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      if (!did) {
        span.set("signedIn", false);
        return EMPTY_FRIEND_PEOPLE;
      }
      span.set("signedIn", true);
      span.set("offset", data.offset);

      const result = await friendPeople(db, schema, did, {
        limit: data.limit,
        offset: data.offset,
      });
      span.set("people", result.personCount);
      span.set("publications", result.publicationCount);
      span.set("degraded", result.degraded);
      span.set("truncated", result.truncated);
      return result;
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
            rotationSeed("discover", "anon"),
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
            seed: rotationSeed("discover", session.did),
          },
        );
        span.set("count", items.length);
        return items.filter((pub) => pub.documentCount > 0);
      },
    ),
  );

export type OnboardingSuggestionKind = "trending" | "topic" | "popular";

export interface OnboardingSuggestionSection {
  kind: OnboardingSuggestionKind;
  /** The selected topic for `kind: "topic"` sections; `null` otherwise. */
  topic: string | null;
  items: Array<PublicationCard>;
}

export interface OnboardingSuggestions {
  sections: Array<OnboardingSuggestionSection>;
  /** URIs shown in the trending section, so the UI can badge them. */
  trendingUris: Array<string>;
}

const onboardingSuggestionsInput = z.object({
  topics: z.array(z.string().min(1).max(60)).max(5).default([]),
  limit: z.number().int().min(1).max(40).default(18),
});

/**
 * Assemble onboarding follow suggestions into deduped sections: trending first,
 * then one section per selected topic (in selection order), then a "popular on
 * the network" backfill sized to reach `limit`. Each publication appears in only
 * the first section that surfaces it, publications with no documents are
 * dropped, and anything in `excludeUris` (the reader's existing follows) is
 * skipped. Pure so it can be unit-tested without a DB.
 */
export function buildOnboardingSections(input: {
  trending: Array<PublicationCard>;
  topicGroups: Array<{ topic: string; items: Array<PublicationCard> }>;
  popular: Array<PublicationCard>;
  excludeUris: Iterable<string>;
  limit: number;
}): Array<OnboardingSuggestionSection> {
  const seen = new Set<string>(input.excludeUris);
  const take = (items: Array<PublicationCard>): Array<PublicationCard> => {
    const out: Array<PublicationCard> = [];
    for (const pub of items) {
      if (pub.documentCount <= 0 || seen.has(pub.uri)) continue;
      seen.add(pub.uri);
      out.push(pub);
    }
    return out;
  };

  const sections: Array<OnboardingSuggestionSection> = [];

  const trending = take(input.trending);
  if (trending.length > 0) {
    sections.push({ kind: "trending", topic: null, items: trending });
  }

  for (const group of input.topicGroups) {
    const items = take(group.items);
    if (items.length > 0) {
      sections.push({ kind: "topic", topic: group.topic, items });
    }
  }

  const already = sections.reduce((n, s) => n + s.items.length, 0);
  const remaining = Math.max(0, input.limit - already);
  if (remaining > 0) {
    const popular = take(input.popular).slice(0, remaining);
    if (popular.length > 0) {
      sections.push({ kind: "popular", topic: null, items: popular });
    }
  }

  return sections;
}

/**
 * Follow suggestions for the first-run onboarding wizard — trending this week,
 * popular publications in each topic the reader picked, and a rotating popular
 * backfill. Pure composition of the existing discover queries; excludes what the
 * reader already follows.
 */
const getOnboardingSuggestions = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(onboardingSuggestionsInput)
  .handler(
    observe(
      "discover.getOnboardingSuggestions",
      async ({ data, context }, span): Promise<OnboardingSuggestions> => {
        const { db, schema } = context;
        const session = await getAtprotoSessionForRequest(getRequest());
        const did = session?.did ?? null;
        if (did) span.set("did", did);

        // De-dupe selected topics case-insensitively, keeping selection order.
        const seenTopic = new Set<string>();
        const topics: Array<string> = [];
        for (const raw of data.topics) {
          const topic = raw.trim();
          const key = topic.toLowerCase();
          if (!topic || seenTopic.has(key)) continue;
          seenTopic.add(key);
          topics.push(topic);
        }
        span.set("topics", topics.join(",") || "(none)");

        const followUris = did
          ? await effectiveFollowUris(db, schema, did)
          : [];

        const [trending, topicGroups] = await Promise.all([
          trendingPublications(db, schema, 6),
          Promise.all(
            topics.map(async (topic) => ({
              topic,
              items: await discoverDirectoryPublications(db, schema, {
                topic,
                sort: "readers",
                limit: 8,
                offset: 0,
              }),
            })),
          ),
        ]);

        const trendingUris = trending.map((pub) => pub.uri);
        const popular = await popularPublications(
          db,
          schema,
          data.limit,
          [...new Set([...followUris, ...trendingUris])],
          rotationSeed("onboarding", did ?? "anon"),
        );

        const sections = buildOnboardingSections({
          trending,
          topicGroups,
          popular,
          excludeUris: followUris,
          limit: data.limit,
        });

        span.set("sections", sections.length);
        span.set(
          "items",
          sections.reduce((n, s) => n + s.items.length, 0),
        );

        return { sections, trendingUris };
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
            seed: rotationSeed("discover-followed-by", session.did),
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

function getOnboardingSuggestionsQueryOptions({
  topics = [],
  limit = 18,
}: z.input<typeof onboardingSuggestionsInput> = {}) {
  return queryOptions({
    queryKey: ["discover", "onboarding-suggestions", topics, limit] as const,
    queryFn: async () => getOnboardingSuggestions({ data: { topics, limit } }),
    staleTime: 60_000,
  });
}

/**
 * A single page of friends' publications. The Discover prompt and the
 * onboarding step take a small page (they only need the counts and the first
 * few faces); `/friends` pages through with
 * {@link getFriendPublishersInfiniteQueryOptions}. The expensive Bluesky sweep
 * is cached server-side per reader, so later pages are DB-only.
 *
 * Keyed under `friends`, deliberately *not* `discover`: subscribing invalidates
 * the whole `["discover"]` prefix, and since the server drops publications the
 * reader already subscribes to, that would make a row vanish the moment it was
 * subscribed to. Rows should settle into "Subscribed" and stay put until the
 * next visit.
 */
function getFriendPublishersQueryOptions({
  limit = FRIEND_PAGE_SIZE,
  offset = 0,
}: z.input<typeof friendPublishersInput> = {}) {
  return queryOptions({
    queryKey: ["friends", "publications", limit, offset] as const,
    queryFn: async () => getFriendPublishers({ data: { limit, offset } }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

function getFriendPublishersInfiniteQueryOptions({
  limit = FRIEND_PAGE_SIZE,
}: { limit?: number } = {}) {
  return infiniteQueryOptions({
    queryKey: ["friends", "publications", "infinite", limit] as const,
    queryFn: async ({ pageParam }) =>
      getFriendPublishers({ data: { limit, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

function getFriendPeopleInfiniteQueryOptions({
  limit = FRIEND_PEOPLE_PAGE_SIZE,
}: { limit?: number } = {}) {
  return infiniteQueryOptions({
    // Same `friends` namespace as the other tabs: following a writer must not
    // invalidate the list out from under the reader mid-visit.
    queryKey: ["friends", "people", "infinite", limit] as const,
    queryFn: async ({ pageParam }) =>
      getFriendPeople({ data: { limit, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

function getFriendArticlesInfiniteQueryOptions({
  limit = FRIEND_ARTICLE_PAGE_SIZE,
}: { limit?: number } = {}) {
  return infiniteQueryOptions({
    // Same `friends` namespace as the Publications tab, and for the same
    // reason: subscribing must not invalidate the list out from under the
    // reader mid-visit.
    queryKey: ["friends", "articles", "infinite", limit] as const,
    queryFn: async ({ pageParam }) =>
      getFriendArticles({ data: { limit, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
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
  getFriendArticles,
  getFriendArticlesInfiniteQueryOptions,
  getFriendPeople,
  getFriendPeopleInfiniteQueryOptions,
  getFriendPublishers,
  getFriendPublishersQueryOptions,
  getFriendPublishersInfiniteQueryOptions,
  getOnboardingSuggestions,
  getOnboardingSuggestionsQueryOptions,
  getEffectiveFollowUris,
  getEffectiveFollowUrisQueryOptions,
};
