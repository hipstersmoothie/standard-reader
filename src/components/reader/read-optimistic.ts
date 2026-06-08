import type { QueryClient } from "@tanstack/react-query";

import type {
  HomeFeed,
  LatestFeed,
  SidebarData,
} from "../../integrations/tanstack-query/api-feed.functions";
import type { ReadStatus } from "../../integrations/tanstack-query/api-reader.functions";
import type { ArticleCard } from "../../integrations/tanstack-query/api-shapes";

function decrement(count: number | null | undefined): number | null {
  if (count == null) return count ?? null;
  return Math.max(0, count - 1);
}

/** Returns the card flipped to read, or the same reference when it doesn't match. */
function flipCard(card: ArticleCard, uri: string): ArticleCard {
  return card.uri === uri && !card.isRead ? { ...card, isRead: true } : card;
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

function isSidebarData(data: unknown): data is SidebarData {
  return (
    typeof data === "object" &&
    data !== null &&
    "following" in data &&
    "signedIn" in data
  );
}

/**
 * Flips `isRead` on any matching card inside a `["feed", …]` cache entry and,
 * when `wasUnread`, decrements the relevant unread counters. Returns the same
 * reference when nothing changed so React Query can skip the update.
 */
function updateFeedCache(
  data: unknown,
  uri: string,
  wasUnread: boolean,
): unknown {
  if (isLatestFeed(data)) {
    return {
      ...data,
      items: data.items.map((card) => flipCard(card, uri)),
      counts: wasUnread
        ? { ...data.counts, unread: Math.max(0, data.counts.unread - 1) }
        : data.counts,
    } satisfies LatestFeed;
  }

  if (isHomeFeed(data)) {
    return {
      ...data,
      featured: data.featured ? flipCard(data.featured, uri) : data.featured,
      latestUnread: data.latestUnread.map((card) => flipCard(card, uri)),
      trending: data.trending.map((card) => flipCard(card, uri)),
      unreadCount: wasUnread ? decrement(data.unreadCount) : data.unreadCount,
    } satisfies HomeFeed;
  }

  if (isSidebarData(data)) {
    return wasUnread
      ? ({
          ...data,
          unreadCount: decrement(data.unreadCount),
        } satisfies SidebarData)
      : data;
  }

  return data;
}

/** True when any cache already records this document as read (idempotency guard). */
function isDocumentReadInCache(
  queryClient: QueryClient,
  documentUri: string,
): boolean {
  const status = queryClient.getQueryData<ReadStatus>([
    "reader",
    "readStatus",
    documentUri,
  ]);
  if (status?.isRead) return true;

  const readDocs = queryClient.getQueriesData<Array<string>>({
    queryKey: ["reader", "readDocuments"],
  });
  for (const [, uris] of readDocs) {
    if (uris?.includes(documentUri)) return true;
  }
  return false;
}

/**
 * Optimistically mark a document read across every cache the UI reads from —
 * feed rails (`isRead` + unread counters), batch read-status lookups, and the
 * single read-status query. Idempotent: a second call for an already-read
 * document won't double-decrement counters.
 */
export function applyMarkReadOptimisticUpdate(
  queryClient: QueryClient,
  documentUri: string,
): void {
  const wasUnread = !isDocumentReadInCache(queryClient, documentUri);

  queryClient.setQueriesData({ queryKey: ["feed"] }, (data) =>
    updateFeedCache(data, documentUri, wasUnread),
  );

  queryClient.setQueriesData<Array<string>>(
    { queryKey: ["reader", "readDocuments"] },
    (data) =>
      data && !data.includes(documentUri) ? [...data, documentUri] : data,
  );

  queryClient.setQueryData<ReadStatus>(["reader", "readStatus", documentUri], {
    isRead: true,
  });
}
