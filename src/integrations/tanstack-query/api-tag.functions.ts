import type { QueryClient } from "@tanstack/react-query";
import type { TagPublicationCard } from "#/server/reader/queries";

import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";
import {
  putSubscriptionRecord,
  subjectRkey,
} from "#/server/atproto/repo-records";
import { upsertSubscription } from "#/server/ingest/handlers";
import { ensureTracked } from "#/server/ingest/tap-client";
import { attachSubscribedLabels } from "#/server/labeler/labels.server";
import { observe } from "#/server/observability/log";
import { attachReaderSpanContext } from "#/server/observability/span-context.ts";
import { attachCommentCountsToArticles } from "#/server/reader/document-comments";
import {
  countTagArticles,
  countTagPublications,
  followedPublications,
  selectArticleCards,
  selectFollowUris,
  selectTagPublicationUris,
  tagDirectoryPublications,
} from "#/server/reader/queries";
import { z } from "zod";

import type { ArticleCard, PublicationCard } from "./api-shapes";

import { dbMiddleware } from "./db-middleware";

export type { TagPublicationCard };

const directorySort = z.enum(["tagged", "readers", "active", "az"]);

const tagInput = z.object({
  tag: z.string().trim().min(1).max(80),
});

const directoryInput = tagInput.extend({
  sort: directorySort.default("readers"),
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
});

export interface TagPublicationDirectoryPage {
  items: Array<TagPublicationCard>;
  nextOffset: number | null;
}

export interface TagArticleDirectoryPage {
  items: Array<ArticleCard>;
  nextOffset: number | null;
}

const articlesPageInput = tagInput.extend({
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
});

const getPublicationCount = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(tagInput)
  .handler(
    observe("tag.getPublicationCount", async ({ data, context }, span) => {
      await attachReaderSpanContext(span, getRequest());
      span.set("tag", data.tag);
      const count = await countTagPublications(
        context.db,
        context.schema,
        data.tag,
      );
      span.set("count", count);
      return count;
    }),
  );

const getArticleCount = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(tagInput)
  .handler(
    observe("tag.getArticleCount", async ({ data, context }, span) => {
      await attachReaderSpanContext(span, getRequest());
      span.set("tag", data.tag);
      const count = await countTagArticles(
        context.db,
        context.schema,
        data.tag,
      );
      span.set("count", count);
      return count;
    }),
  );

const getArticles = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(articlesPageInput)
  .handler(
    observe("tag.getArticles", async ({ data, context }, span) => {
      const { db, schema, trackReadingEnabled } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      span.set("tag", data.tag);
      span.set("offset", data.offset);

      const trackReading = did == null ? false : trackReadingEnabled;

      const rows = await selectArticleCards(db, schema, {
        tag: data.tag,
        discoverOnly: true,
        limit: data.limit,
        offset: data.offset,
        readForDid: trackReading && did ? did : undefined,
      });

      const withCounts = await attachCommentCountsToArticles(db, schema, rows);
      const items = await attachSubscribedLabels(db, schema, did, withCounts);
      span.set("count", items.length);

      return {
        items,
        nextOffset:
          items.length === data.limit ? data.offset + data.limit : null,
      } satisfies TagArticleDirectoryPage;
    }),
  );

const getPublications = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(directoryInput)
  .handler(
    observe("tag.getPublications", async ({ data, context }, span) => {
      const { db, schema } = context;
      await attachReaderSpanContext(span, getRequest());
      span.set("tag", data.tag);
      span.set("sort", data.sort);
      span.set("offset", data.offset);

      const items = await tagDirectoryPublications(db, schema, {
        tag: data.tag,
        sort: data.sort,
        limit: data.limit,
        offset: data.offset,
      });

      span.set("count", items.length);
      return {
        items,
        nextOffset:
          items.length === data.limit ? data.offset + data.limit : null,
      } satisfies TagPublicationDirectoryPage;
    }),
  );

const tagPageInput = tagInput.extend({
  view: z.enum(["feed", "publications"]),
  sort: directorySort.default("tagged"),
  limit: z.number().int().min(1).max(60).default(24),
  offset: z.number().int().min(0).default(0),
});

export interface TagPageData {
  articleCount: number;
  publicationCount: number;
  articles?: TagArticleDirectoryPage;
  publications?: TagPublicationDirectoryPage;
}

export interface TagFollowSummary {
  publicationCount: number;
  /** Publications the reader is not subscribed to yet. */
  unfollowedCount: number;
}

export interface TagFollowAllResult {
  followedCount: number;
  publications: Array<PublicationCard>;
}

/** One round trip for tag directory counts + the active tab's first page. */
const getTagPage = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(tagPageInput)
  .handler(
    observe("tag.getPage", async ({ data, context }, span) => {
      const { db, schema, trackReadingEnabled } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      span.set("tag", data.tag);
      span.set("view", data.view);
      span.set("offset", data.offset);
      if (data.view === "publications") {
        span.set("sort", data.sort);
      }

      const trackReading = did == null ? false : trackReadingEnabled;

      const [articleCount, publicationCount, content] = await Promise.all([
        countTagArticles(db, schema, data.tag),
        countTagPublications(db, schema, data.tag),
        data.view === "feed"
          ? selectArticleCards(db, schema, {
              tag: data.tag,
              discoverOnly: true,
              limit: data.limit,
              offset: data.offset,
              readForDid: trackReading && did ? did : undefined,
            }).then((rows) => attachCommentCountsToArticles(db, schema, rows))
          : tagDirectoryPublications(db, schema, {
              tag: data.tag,
              sort: data.sort,
              limit: data.limit,
              offset: data.offset,
            }),
      ]);

      span.set("articleCount", articleCount);
      span.set("publicationCount", publicationCount);

      if (data.view === "feed") {
        const items = content as Array<ArticleCard>;
        span.set("count", items.length);
        return {
          articleCount,
          publicationCount,
          articles: {
            items,
            nextOffset:
              items.length === data.limit ? data.offset + data.limit : null,
          },
        } satisfies TagPageData;
      }

      const items = content as Array<TagPublicationCard>;
      span.set("count", items.length);
      return {
        articleCount,
        publicationCount,
        publications: {
          items,
          nextOffset:
            items.length === data.limit ? data.offset + data.limit : null,
        },
      } satisfies TagPageData;
    }),
  );

const getTagFollowSummary = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(tagInput)
  .handler(
    observe("tag.getFollowSummary", async ({ data, context }, span) => {
      const { db, schema } = context;
      const did = await attachReaderSpanContext(span, getRequest());
      span.set("tag", data.tag);

      const publicationUris = await selectTagPublicationUris(
        db,
        schema,
        data.tag,
      );
      span.set("publicationCount", publicationUris.length);

      if (!did || publicationUris.length === 0) {
        return {
          publicationCount: publicationUris.length,
          unfollowedCount: publicationUris.length,
        } satisfies TagFollowSummary;
      }

      const followUris = await selectFollowUris(db, schema, did);
      const followedSet = new Set(followUris);
      const unfollowedCount = publicationUris.filter(
        (uri) => !followedSet.has(uri),
      ).length;
      span.set("unfollowedCount", unfollowedCount);

      return {
        publicationCount: publicationUris.length,
        unfollowedCount,
      } satisfies TagFollowSummary;
    }),
  );

const followTagPublications = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(tagInput)
  .handler(
    observe("tag.followPublications", async ({ data, context }, span) => {
      const { db, schema } = context;
      span.set("tag", data.tag);

      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to follow publications.");
      }
      span.set("did", session.did);

      const publicationUris = await selectTagPublicationUris(
        db,
        schema,
        data.tag,
      );
      const followUris = await selectFollowUris(db, schema, session.did);
      const followedSet = new Set(followUris);
      const unfollowedUris = publicationUris.filter(
        (uri) => !followedSet.has(uri),
      );
      span.set("unfollowedCount", unfollowedUris.length);

      if (unfollowedUris.length === 0) {
        return {
          followedCount: 0,
          publications: [],
        } satisfies TagFollowAllResult;
      }

      const createdAt = new Date().toISOString();
      for (const publicationUri of unfollowedUris) {
        const { uri, cid } = await putSubscriptionRecord(
          session.client,
          session.did,
          publicationUri,
          createdAt,
        );
        await upsertSubscription(
          uri,
          session.did,
          subjectRkey(publicationUri),
          cid,
          {
            publication: publicationUri,
            createdAt,
          },
        );
      }

      try {
        await ensureTracked(session.did, "reader");
      } catch (error) {
        console.warn("[tag] failed to track reader repo", session.did, error);
      }

      const publications = await followedPublications(
        db,
        schema,
        unfollowedUris,
      );

      span.set("followedCount", unfollowedUris.length);
      return {
        followedCount: unfollowedUris.length,
        publications,
      } satisfies TagFollowAllResult;
    }),
  );

function getTagFollowSummaryQueryOptions({ tag }: z.input<typeof tagInput>) {
  return queryOptions({
    queryKey: ["tag", "followSummary", tag] as const,
    queryFn: async () => getTagFollowSummary({ data: { tag } }),
  });
}

function followTagPublicationsMutationOptions() {
  return mutationOptions({
    mutationKey: ["tag", "followPublications"] as const,
    mutationFn: async (tag: string) => followTagPublications({ data: { tag } }),
  });
}

function getArticleCountQueryOptions({ tag }: z.input<typeof tagInput>) {
  return queryOptions({
    queryKey: ["tag", "articleCount", tag] as const,
    queryFn: async () => getArticleCount({ data: { tag } }),
  });
}

function getArticlesQueryOptions({
  tag,
  limit = 24,
  offset = 0,
}: z.input<typeof articlesPageInput>) {
  return queryOptions({
    queryKey: ["tag", "articles", tag, limit, offset] as const,
    queryFn: async () => getArticles({ data: { tag, limit, offset } }),
  });
}

function getPublicationCountQueryOptions({ tag }: z.input<typeof tagInput>) {
  return queryOptions({
    queryKey: ["tag", "publicationCount", tag] as const,
    queryFn: async () => getPublicationCount({ data: { tag } }),
  });
}

function getPublicationsQueryOptions({
  tag,
  sort = "readers",
  limit = 24,
  offset = 0,
}: z.input<typeof directoryInput>) {
  return queryOptions({
    queryKey: ["tag", "publications", tag, sort, limit, offset] as const,
    queryFn: async () =>
      getPublications({ data: { tag, sort, limit, offset } }),
  });
}

/** Seed per-query caches from a combined `getTagPage` response. */
function seedTagPageCaches(
  queryClient: QueryClient,
  page: TagPageData,
  {
    tag,
    sort = "tagged",
    limit = 24,
    offset = 0,
  }: z.input<typeof tagPageInput>,
): void {
  queryClient.setQueryData(
    getArticleCountQueryOptions({ tag }).queryKey,
    page.articleCount,
  );
  queryClient.setQueryData(
    getPublicationCountQueryOptions({ tag }).queryKey,
    page.publicationCount,
  );

  if (page.articles) {
    queryClient.setQueryData(
      getArticlesQueryOptions({ tag, limit, offset }).queryKey,
      page.articles,
    );
  }

  if (page.publications) {
    queryClient.setQueryData(
      getPublicationsQueryOptions({ tag, sort, limit, offset }).queryKey,
      page.publications,
    );
  }
}

export const tagApi = {
  getArticleCount,
  getArticleCountQueryOptions,
  getArticles,
  getArticlesQueryOptions,
  getPublicationCount,
  getPublicationCountQueryOptions,
  getPublications,
  getPublicationsQueryOptions,
  getTagFollowSummary,
  getTagFollowSummaryQueryOptions,
  followTagPublications,
  followTagPublicationsMutationOptions,
  getTagPage,
  seedTagPageCaches,
};
