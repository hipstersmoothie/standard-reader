import type { QueryClient } from "@tanstack/react-query";

import type {
  HomeFeed,
  LatestFeed,
} from "../../integrations/tanstack-query/api-feed.functions";
import type { ArticleDetail } from "../../integrations/tanstack-query/api-publication.functions";
import type { RecommendStatus } from "../../integrations/tanstack-query/api-reader.functions";
import type { ArticleCard } from "../../integrations/tanstack-query/api-shapes";

export interface RecommendOptimisticContext {
  prevStatus: RecommendStatus | undefined;
  prevArticle: ArticleDetail | null | undefined;
  prevFeedEntries: Array<[readonly unknown[], unknown]>;
}

function bumpCount(count: number, delta: number): number {
  return Math.max(0, count + delta);
}

function isLatestFeed(data: unknown): data is LatestFeed {
  return (
    typeof data === "object" &&
    data !== null &&
    "items" in data &&
    "counts" in data
  );
}

function isHomeFeed(data: unknown): data is HomeFeed {
  return (
    typeof data === "object" &&
    data !== null &&
    "latestUnread" in data &&
    "trending" in data
  );
}

function bumpCard(
  card: ArticleCard,
  documentUri: string,
  delta: number,
): ArticleCard {
  if (card.uri !== documentUri || delta === 0) return card;
  return { ...card, recommendCount: bumpCount(card.recommendCount, delta) };
}

function updateFeedCache(
  data: unknown,
  documentUri: string,
  delta: number,
): unknown {
  if (isLatestFeed(data)) {
    return {
      ...data,
      items: data.items.map((item) => bumpCard(item, documentUri, delta)),
    };
  }
  if (isHomeFeed(data)) {
    return {
      ...data,
      featured: data.featured
        ? bumpCard(data.featured, documentUri, delta)
        : data.featured,
      latestUnread: data.latestUnread.map((item) =>
        bumpCard(item, documentUri, delta),
      ),
      trending: data.trending.map((item) => bumpCard(item, documentUri, delta)),
    };
  }
  return data;
}

function isRecommendedInCache(
  queryClient: QueryClient,
  documentUri: string,
): boolean {
  return (
    queryClient.getQueryData<RecommendStatus>([
      "reader",
      "recommendStatus",
      documentUri,
    ])?.isRecommended ?? false
  );
}

/** Optimistically flip like state and bump network recommend counts in the cache. */
export function applyRecommendOptimisticUpdate(
  queryClient: QueryClient,
  documentUri: string,
  recommended: boolean,
): RecommendOptimisticContext {
  const statusKey = ["reader", "recommendStatus", documentUri] as const;
  const articleKey = ["article", documentUri] as const;

  const wasRecommended = isRecommendedInCache(queryClient, documentUri);
  const delta =
    recommended && !wasRecommended
      ? 1
      : !recommended && wasRecommended
        ? -1
        : 0;

  const prevStatus = queryClient.getQueryData<RecommendStatus>(statusKey);
  const prevArticle = queryClient.getQueryData<ArticleDetail | null>(
    articleKey,
  );
  const prevFeedEntries = queryClient.getQueriesData({ queryKey: ["feed"] });

  queryClient.setQueryData<RecommendStatus>(statusKey, {
    isRecommended: recommended,
  });

  queryClient.setQueryData<ArticleDetail | null>(articleKey, (article) => {
    if (!article || delta === 0) return article;
    return {
      ...article,
      recommendCount: bumpCount(article.recommendCount, delta),
    };
  });

  queryClient.setQueriesData({ queryKey: ["feed"] }, (data) =>
    updateFeedCache(data, documentUri, delta),
  );

  return { prevStatus, prevArticle, prevFeedEntries };
}

export function rollbackRecommendOptimisticUpdate(
  queryClient: QueryClient,
  documentUri: string,
  context: RecommendOptimisticContext,
) {
  const statusKey = ["reader", "recommendStatus", documentUri] as const;
  const articleKey = ["article", documentUri] as const;

  if (context.prevStatus) {
    queryClient.setQueryData(statusKey, context.prevStatus);
  } else {
    queryClient.removeQueries({ queryKey: statusKey });
  }

  if (context.prevArticle !== undefined) {
    queryClient.setQueryData(articleKey, context.prevArticle);
  }

  for (const [key, data] of context.prevFeedEntries) {
    queryClient.setQueryData(key, data);
  }
}

/** Read the optimistic recommend count for an article page like button. */
export function recommendCountFromCache(
  queryClient: QueryClient,
  documentUri: string,
  fallback: number,
): number {
  const article = queryClient.getQueryData<ArticleDetail | null>([
    "article",
    documentUri,
  ]);
  return article?.recommendCount ?? fallback;
}
