import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { blockFilterDid } from "#/server/blocks/blocks";
import { observe } from "#/server/observability/log";
import { attachReaderSpanContext } from "#/server/observability/span-context.ts";
import { attachCommentCountsToArticles } from "#/server/reader/document-comments";
import { selectArticleCardsByUris } from "#/server/reader/queries";
import { rotationSeed } from "#/server/reader/rail-rotation";
import {
  attachRecommendedByToArticles,
  attachViewerRecommendedToArticles,
} from "#/server/reader/recommended-by";
import {
  effectiveFollowSets,
  effectiveFollowUris,
} from "#/server/reader/saved-lists";
import type {
  TopicCard,
  TopicDirectorySort,
  TopicRedirect,
} from "#/server/reader/topics";
import {
  topicBySlug,
  topicPublicationCards,
  topicTagList,
  countTopicPublications,
  discoverTopics,
  listTopics,
  selectTopicDocumentUris,
  topicRedirectTarget,
} from "#/server/reader/topics";

import type { ArticleCard, PublicationCard } from "./api-shapes";
import { dbMiddleware } from "./db-middleware";

export type { TopicCard };

/**
 * Topic reads (`APP_VISION.md` §5). Topics are clusters of related
 * tags derived by the recompute sweep; these serve the Discover rail and the
 * per-topic page.
 */

const directorySort = z.enum(["belonging", "readers", "active", "az"]);
const articleSortEnum = z.enum(["recent", "trending", "popular"]);

export type TopicArticleSort = z.infer<typeof articleSortEnum>;

/**
 * Sub-area chips on the topic page. Capped by the stored signature (24
 * tags), which is plenty for a chip row and avoids joining `topic_tags`
 * just to render the masthead.
 */
const TOPIC_PAGE_TAGS = 24;

const slugInput = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[\w-]+$/, "invalid topic slug"),
});

const railInput = z.object({
  limit: z.number().int().min(1).max(24).default(8),
});

const publicationsInput = slugInput.extend({
  sort: directorySort.default("belonging"),
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
});

const articlesInput = slugInput.extend({
  articleSort: articleSortEnum.default("recent"),
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
});

const topicPageInput = slugInput.extend({
  view: z.enum(["feed", "publications"]).default("feed"),
  sort: directorySort.default("belonging"),
  articleSort: articleSortEnum.default("recent"),
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
});

export interface TopicPublicationPage {
  items: Array<PublicationCard>;
  nextOffset: number | null;
}

export interface TopicArticlePage {
  items: Array<ArticleCard>;
  nextOffset: number | null;
}

export interface TopicPageData {
  topic: TopicCard | null;
  /**
   * Set only when `topic` is null. `known: false` is a real 404; otherwise the
   * slug once existed and the route redirects — to `slug` if a topic absorbed
   * it, or to the index when nothing did. See `topicRedirectTarget`.
   */
  redirect?: TopicRedirect;
  publicationCount: number;
  articles?: TopicArticlePage;
  publications?: TopicPublicationPage;
}

/** Every published topic, for the browse-all index. */
const getAllTopics = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("topics.list", async ({ context }, span) => {
      const { db, schema } = context;
      await attachReaderSpanContext(span, getRequest());
      const items = await listTopics(db, schema);
      span.set("count", items.length);
      return items;
    }),
  );

/** Topics for the Discover rail, personalized to the reader's follows. */
const getDiscoverTopics = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(railInput)
  .handler(
    observe("topics.getDiscoverRail", async ({ data, context }, span) => {
      const { db, schema } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      const followUris = did ? await effectiveFollowUris(db, schema, did) : [];
      span.set("personalized", followUris.length > 0);

      const items = await discoverTopics(db, schema, {
        limit: data.limit,
        followUris,
        seed: rotationSeed("topics", did ?? "anon"),
      });
      span.set("count", items.length);
      return items;
    }),
  );

async function loadTopicArticles(
  context: {
    db: Parameters<typeof selectArticleCardsByUris>[0];
    schema: Parameters<typeof selectArticleCardsByUris>[1];
    trackReadingEnabled: boolean;
    countOldPostsAsUnreadEnabled: boolean;
  },
  did: string | null,
  tags: Array<string>,
  { slug, articleSort, limit, offset }: z.infer<typeof articlesInput>,
): Promise<TopicArticlePage> {
  const { db, schema } = context;
  if (tags.length === 0) return { items: [], nextOffset: null };

  const trackReading = did == null ? false : context.trackReadingEnabled;
  const countOldPostsAsUnread =
    did == null ? true : context.countOldPostsAsUnreadEnabled;

  // Two steps rather than one query: resolving the page's URIs through the tag
  // GIN index first is what keeps this off a 1.6s plan — see
  // `selectTopicDocumentUris`.
  const [uris, followSets] = await Promise.all([
    selectTopicDocumentUris(db, {
      slug,
      tags,
      sort: articleSort,
      limit,
      offset,
    }),
    did ? effectiveFollowSets(db, schema, did) : Promise.resolve(null),
  ]);
  const rows = await selectArticleCardsByUris(db, schema, uris, {
    readForDid: trackReading && did ? did : undefined,
    countOldPostsAsUnread,
    viewerDid: await blockFilterDid(db, schema, did),
  });

  const withComments = await attachCommentCountsToArticles(db, schema, rows);
  const withRecs = await attachRecommendedByToArticles(
    db,
    schema,
    followSets?.userDids ?? [],
    withComments,
  );
  const items = await attachViewerRecommendedToArticles(
    db,
    schema,
    did,
    withRecs,
  );

  return { items, nextOffset: items.length === limit ? offset + limit : null };
}

const getArticles = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(articlesInput)
  .handler(
    observe("topics.getArticles", async ({ data, context }, span) => {
      const { db, schema } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      span.set("slug", data.slug);
      span.set("offset", data.offset);

      const tags = await topicTagList(db, schema, data.slug);
      const page = await loadTopicArticles(context, did, tags, data);
      span.set("count", page.items.length);
      return page;
    }),
  );

const getPublications = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(publicationsInput)
  .handler(
    observe("topics.getPublications", async ({ data, context }, span) => {
      const { db, schema } = context;
      await attachReaderSpanContext(span, getRequest());
      span.set("slug", data.slug);
      span.set("sort", data.sort);
      span.set("offset", data.offset);

      const items = await topicPublicationCards(db, schema, {
        slug: data.slug,
        sort: data.sort as TopicDirectorySort,
        limit: data.limit,
        offset: data.offset,
      });
      span.set("count", items.length);
      return {
        items,
        nextOffset:
          items.length === data.limit ? data.offset + data.limit : null,
      } satisfies TopicPublicationPage;
    }),
  );

/**
 * One round trip for the topic page: masthead + counts + the active tab's
 * first page. Only the active tab is fetched — the inactive panel never mounts
 * its query, so fetching both would double the work on every load.
 */
const getTopicPage = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(topicPageInput)
  .handler(
    observe("topics.getPage", async ({ data, context }, span) => {
      const { db, schema } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      span.set("slug", data.slug);
      span.set("view", data.view);
      span.set("offset", data.offset);

      const topic = await topicBySlug(db, schema, data.slug, {
        tagLimit: TOPIC_PAGE_TAGS,
      });
      if (!topic) {
        span.set("found", false);
        // Unpublished or unknown. Resolving costs one more query, but only on
        // a path that was going to be an error page anyway.
        const redirect = await topicRedirectTarget(db, data.slug);
        span.set("redirect.known", redirect.known);
        span.set("redirect.slug", redirect.slug ?? "");
        return {
          topic: null,
          redirect,
          publicationCount: 0,
        } satisfies TopicPageData;
      }

      const [publicationCount, content] = await Promise.all([
        countTopicPublications(db, schema, data.slug),
        data.view === "feed"
          ? topicTagList(db, schema, data.slug).then((tags) =>
              loadTopicArticles(context, did, tags, {
                slug: data.slug,
                articleSort: data.articleSort,
                limit: data.limit,
                offset: data.offset,
              }),
            )
          : topicPublicationCards(db, schema, {
              slug: data.slug,
              sort: data.sort as TopicDirectorySort,
              limit: data.limit,
              offset: data.offset,
            }).then(
              (items) =>
                ({
                  items,
                  nextOffset:
                    items.length === data.limit
                      ? data.offset + data.limit
                      : null,
                }) satisfies TopicPublicationPage,
            ),
      ]);

      span.set("publicationCount", publicationCount);

      return data.view === "feed"
        ? ({
            topic,
            publicationCount,
            articles: content as TopicArticlePage,
          } satisfies TopicPageData)
        : ({
            topic,
            publicationCount,
            publications: content as TopicPublicationPage,
          } satisfies TopicPageData);
    }),
  );

function getAllTopicsQueryOptions() {
  return queryOptions({
    queryKey: ["topics", "all"] as const,
    queryFn: async () => getAllTopics(),
    staleTime: 60_000,
  });
}

function getDiscoverTopicsQueryOptions({ limit = 8 }: { limit?: number } = {}) {
  return queryOptions({
    queryKey: ["topics", "discover", limit] as const,
    queryFn: async () => getDiscoverTopics({ data: { limit } }),
    staleTime: 60_000,
  });
}

function getArticlesQueryOptions({
  slug,
  articleSort = "recent",
  limit = 24,
  offset = 0,
}: z.input<typeof articlesInput>) {
  return queryOptions({
    queryKey: ["topics", "articles", slug, articleSort, limit, offset] as const,
    queryFn: async () =>
      getArticles({ data: { slug, articleSort, limit, offset } }),
  });
}

function getPublicationsQueryOptions({
  slug,
  sort = "belonging",
  limit = 24,
  offset = 0,
}: z.input<typeof publicationsInput>) {
  return queryOptions({
    queryKey: ["topics", "publications", slug, sort, limit, offset] as const,
    queryFn: async () =>
      getPublications({ data: { slug, sort, limit, offset } }),
  });
}

function getTopicQueryOptions({ slug }: z.input<typeof slugInput>) {
  return queryOptions({
    queryKey: ["topics", "detail", slug] as const,
    queryFn: async () =>
      getTopicPage({ data: { slug, view: "publications", limit: 1 } }).then(
        (page) => page.topic,
      ),
  });
}

function getPublicationCountQueryOptions({ slug }: z.input<typeof slugInput>) {
  return queryOptions({
    queryKey: ["topics", "publicationCount", slug] as const,
    queryFn: async () =>
      getTopicPage({ data: { slug, view: "publications", limit: 1 } }).then(
        (page) => page.publicationCount,
      ),
  });
}

/** Seed per-query caches from a combined {@link getTopicPage} response. */
function seedTopicPageCaches(
  queryClient: QueryClient,
  page: TopicPageData,
  {
    slug,
    sort = "belonging",
    articleSort = "recent",
    limit = 24,
    offset = 0,
  }: z.input<typeof topicPageInput>,
): void {
  queryClient.setQueryData(getTopicQueryOptions({ slug }).queryKey, page.topic);
  queryClient.setQueryData(
    getPublicationCountQueryOptions({ slug }).queryKey,
    page.publicationCount,
  );

  if (page.articles) {
    queryClient.setQueryData(
      getArticlesQueryOptions({ slug, articleSort, limit, offset }).queryKey,
      page.articles,
    );
  }

  if (page.publications) {
    queryClient.setQueryData(
      getPublicationsQueryOptions({ slug, sort, limit, offset }).queryKey,
      page.publications,
    );
  }
}

export const topicsApi = {
  getAllTopics,
  getAllTopicsQueryOptions,
  getDiscoverTopics,
  getDiscoverTopicsQueryOptions,
  getArticles,
  getArticlesQueryOptions,
  getPublications,
  getPublicationsQueryOptions,
  getTopicPage,
  getTopicQueryOptions,
  getPublicationCountQueryOptions,
  seedTopicPageCaches,
};
