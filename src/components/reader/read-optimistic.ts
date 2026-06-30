import type { QueryClient } from "@tanstack/react-query";

import type {
  HomeFeed,
  LatestFeed,
  LatestFeedCounts,
  SidebarData,
} from "../../integrations/tanstack-query/api-feed.functions";
import type {
  PublicationDocumentsPage,
  PublicationProfile,
} from "../../integrations/tanstack-query/api-publication.functions";
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

function markCardRead(card: ArticleCard, uri: string): ArticleCard {
  return card.uri === uri ? { ...card, isRead: true } : card;
}

function isPublicationProfile(data: unknown): data is PublicationProfile {
  return (
    typeof data === "object" &&
    data !== null &&
    "recentDocuments" in data &&
    "publication" in data
  );
}

function isPublicationDocumentsPage(
  data: unknown,
): data is PublicationDocumentsPage {
  return (
    typeof data === "object" &&
    data !== null &&
    "items" in data &&
    "nextOffset" in data
  );
}

function isLatestFeedCounts(data: unknown): data is LatestFeedCounts {
  return (
    typeof data === "object" &&
    data !== null &&
    "unread" in data &&
    "subscriptions" in data &&
    "all" in data &&
    "trending" in data &&
    !("items" in data)
  );
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

function findPublicationUri(
  queryClient: QueryClient,
  documentUri: string,
): string | null {
  const feedQueries = queryClient.getQueriesData({ queryKey: ["feed"] });
  for (const [, data] of feedQueries) {
    if (isLatestFeed(data)) {
      const item = data.items.find((card) => card.uri === documentUri);
      if (item?.publicationUri) return item.publicationUri;
    }
    if (isHomeFeed(data)) {
      const cards = [
        data.featured,
        ...data.latestUnread,
        ...data.trending,
      ].filter((card): card is ArticleCard => card != null);
      const item = cards.find((card) => card.uri === documentUri);
      if (item?.publicationUri) return item.publicationUri;
    }
  }
  return null;
}

function decrementFollowingUnread(
  following: SidebarData["following"],
  publicationUri: string | null,
): SidebarData["following"] {
  if (!publicationUri) return following;
  return following.map((pub) =>
    pub.uri === publicationUri && pub.unreadCount > 0
      ? { ...pub, unreadCount: pub.unreadCount - 1 }
      : pub,
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
  publicationUri: string | null,
  skipSidebar = false,
): unknown {
  if (isLatestFeed(data)) {
    return {
      ...data,
      items: data.items.map((card) => flipCard(card, uri)),
      counts:
        wasUnread && data.counts
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
    if (skipSidebar || !wasUnread) return data;
    return {
      ...data,
      unreadCount: decrement(data.unreadCount),
      following: decrementFollowingUnread(data.following, publicationUri),
    } satisfies SidebarData;
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

/** Unread dot for feeds and publication lists using inline SQL `isRead` + optimistic cache. */
export function isArticleUnreadForReader(
  queryClient: QueryClient,
  article: Pick<ArticleCard, "uri" | "isRead">,
  {
    trackReading,
    signedIn,
  }: {
    trackReading: boolean;
    signedIn: boolean;
  },
): boolean {
  if (!trackReading || !signedIn) return false;
  if (isDocumentReadInCache(queryClient, article.uri)) return false;
  return !article.isRead;
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
  publicationUri?: string | null,
): void {
  const wasUnread = !isDocumentReadInCache(queryClient, documentUri);
  const pubUri = publicationUri ?? findPublicationUri(queryClient, documentUri);

  queryClient.setQueriesData({ queryKey: ["feed"] }, (data) =>
    updateFeedCache(data, documentUri, wasUnread, pubUri),
  );

  queryClient.setQueriesData(
    { queryKey: ["publication", "profile"] },
    (data) => {
      if (!isPublicationProfile(data)) return data;
      return {
        ...data,
        recentDocuments: data.recentDocuments.map((card) =>
          markCardRead(card, documentUri),
        ),
      } satisfies PublicationProfile;
    },
  );

  queryClient.setQueriesData(
    { queryKey: ["publication", "documents"] },
    (data) => {
      if (!isPublicationDocumentsPage(data)) return data;
      return {
        ...data,
        items: data.items.map((card) => markCardRead(card, documentUri)),
      } satisfies PublicationDocumentsPage;
    },
  );

  if (wasUnread) {
    queryClient.setQueriesData<LatestFeedCounts>(
      { queryKey: ["feed", "latest", "counts"] },
      (data) =>
        data ? { ...data, unread: Math.max(0, data.unread - 1) } : data,
    );
  }

  queryClient.setQueriesData<Array<string>>(
    { queryKey: ["reader", "readDocuments"] },
    (data) =>
      data && !data.includes(documentUri) ? [...data, documentUri] : data,
  );

  queryClient.setQueryData<ReadStatus>(["reader", "readStatus", documentUri], {
    isRead: true,
  });
}

export interface MarkReadManyOptimisticOptions {
  /** Scope sidebar unread to one publication ("mark all as read" on a profile). */
  publicationUri?: string;
  /** Clear every followed publication's sidebar badge (global mark-all-read). */
  clearAllFollowingUnread?: boolean;
}

/** Batch wrapper around {@link applyMarkReadOptimisticUpdate}. */
export function applyMarkReadManyOptimisticUpdate(
  queryClient: QueryClient,
  documentUris: Array<string>,
  options: MarkReadManyOptimisticOptions = {},
): void {
  const { publicationUri, clearAllFollowingUnread = false } = options;
  let newlyReadCount = 0;

  for (const documentUri of documentUris) {
    const wasUnread = !isDocumentReadInCache(queryClient, documentUri);
    if (wasUnread) newlyReadCount++;

    const pubUri =
      publicationUri ?? findPublicationUri(queryClient, documentUri);

    queryClient.setQueriesData({ queryKey: ["feed"] }, (data) =>
      updateFeedCache(data, documentUri, wasUnread, pubUri, true),
    );

    queryClient.setQueriesData(
      { queryKey: ["publication", "profile"] },
      (data) => {
        if (!isPublicationProfile(data)) return data;
        return {
          ...data,
          recentDocuments: data.recentDocuments.map((card) =>
            markCardRead(card, documentUri),
          ),
        } satisfies PublicationProfile;
      },
    );

    queryClient.setQueriesData(
      { queryKey: ["publication", "documents"] },
      (data) => {
        if (!isPublicationDocumentsPage(data)) return data;
        return {
          ...data,
          items: data.items.map((card) => markCardRead(card, documentUri)),
        } satisfies PublicationDocumentsPage;
      },
    );

    queryClient.setQueriesData<Array<string>>(
      { queryKey: ["reader", "readDocuments"] },
      (data) =>
        data && !data.includes(documentUri) ? [...data, documentUri] : data,
    );

    queryClient.setQueryData<ReadStatus>(
      ["reader", "readStatus", documentUri],
      {
        isRead: true,
      },
    );
  }

  if (
    newlyReadCount === 0 &&
    !clearAllFollowingUnread &&
    publicationUri == null
  ) {
    return;
  }

  queryClient.setQueriesData({ queryKey: ["feed"] }, (data) => {
    if (isSidebarData(data)) {
      if (data.unreadCount == null) return data;

      if (clearAllFollowingUnread) {
        return {
          ...data,
          unreadCount: 0,
          following: data.following.map((pub) => ({ ...pub, unreadCount: 0 })),
        } satisfies SidebarData;
      }

      if (publicationUri) {
        return {
          ...data,
          unreadCount: Math.max(0, data.unreadCount - newlyReadCount),
          following: data.following.map((pub) =>
            pub.uri === publicationUri
              ? {
                  ...pub,
                  unreadCount: Math.max(0, pub.unreadCount - newlyReadCount),
                }
              : pub,
          ),
        } satisfies SidebarData;
      }

      if (newlyReadCount > 0) {
        return {
          ...data,
          unreadCount: Math.max(0, data.unreadCount - newlyReadCount),
        } satisfies SidebarData;
      }

      return data;
    }

    if (clearAllFollowingUnread && isLatestFeed(data)) {
      return {
        ...data,
        items: data.items.map((card) =>
          card.isRead ? card : { ...card, isRead: true },
        ),
        counts: data.counts ? { ...data.counts, unread: 0 } : data.counts,
      } satisfies LatestFeed;
    }

    if (isLatestFeedCounts(data)) {
      if (clearAllFollowingUnread) {
        return { ...data, unread: 0 } satisfies LatestFeedCounts;
      }
      if (newlyReadCount > 0) {
        return {
          ...data,
          unread: Math.max(0, data.unread - newlyReadCount),
        } satisfies LatestFeedCounts;
      }
    }

    if (clearAllFollowingUnread && isHomeFeed(data)) {
      return {
        ...data,
        featured: data.featured?.isRead
          ? data.featured
          : data.featured
            ? { ...data.featured, isRead: true }
            : data.featured,
        latestUnread: data.latestUnread.map((card) =>
          card.isRead ? card : { ...card, isRead: true },
        ),
        trending: data.trending.map((card) =>
          card.isRead ? card : { ...card, isRead: true },
        ),
        unreadCount: 0,
      } satisfies HomeFeed;
    }

    return data;
  });
}

export function invalidateReadQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["feed"] });
  void queryClient.invalidateQueries({ queryKey: ["reader", "readDocuments"] });
  void queryClient.invalidateQueries({ queryKey: ["reader", "readStatus"] });
  void queryClient.invalidateQueries({ queryKey: ["reader", "history"] });
  void queryClient.invalidateQueries({ queryKey: ["publication", "profile"] });
  void queryClient.invalidateQueries({
    queryKey: ["publication", "documents"],
  });
}
