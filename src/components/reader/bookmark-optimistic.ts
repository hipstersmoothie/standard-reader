import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import type { SidebarData } from "../../integrations/tanstack-query/api-feed.functions";
import type {
  BookmarkStatus,
  ReaderListPage,
  SavedArticleItem,
} from "../../integrations/tanstack-query/api-reader.functions";

export interface BookmarkOptimisticContext {
  prevStatus: BookmarkStatus | undefined;
  prevSavedEntries: Array<[readonly unknown[], unknown]>;
}

type SavedInfiniteData = InfiniteData<ReaderListPage<SavedArticleItem>>;

function isSavedInfiniteData(data: unknown): data is SavedInfiniteData {
  return (
    typeof data === "object" &&
    data !== null &&
    "pages" in data &&
    Array.isArray((data as SavedInfiniteData).pages)
  );
}

function removeFromSavedInfinite(
  data: SavedInfiniteData | undefined,
  documentUri: string,
): SavedInfiniteData | undefined {
  if (!data?.pages) return data;

  let removed = false;
  const pages = data.pages.map((page) => {
    const items = page.items.filter((item) => {
      if (item.documentUri === documentUri) {
        removed = true;
        return false;
      }
      return true;
    });
    return { ...page, items };
  });

  if (!removed) return data;

  return {
    ...data,
    pages: pages.map((page) => ({
      ...page,
      total: Math.max(0, page.total - 1),
    })),
  };
}

function isSidebarData(data: unknown): data is SidebarData {
  return (
    typeof data === "object" &&
    data !== null &&
    "following" in data &&
    "signedIn" in data
  );
}

function adjustSavedCount(
  count: number | null | undefined,
  delta: number,
): number | null {
  if (count == null) return count ?? null;
  return Math.max(0, count + delta);
}

function isBookmarkedInCache(
  queryClient: QueryClient,
  documentUri: string,
): boolean {
  return (
    queryClient.getQueryData<BookmarkStatus>([
      "reader",
      "bookmarkStatus",
      documentUri,
    ])?.isBookmarked ?? false
  );
}

/** Optimistically flip save-for-later state in the React Query cache. */
export function applyBookmarkOptimisticUpdate(
  queryClient: QueryClient,
  documentUri: string,
  bookmarked: boolean,
): BookmarkOptimisticContext {
  const statusKey = ["reader", "bookmarkStatus", documentUri] as const;
  const wasBookmarked = isBookmarkedInCache(queryClient, documentUri);

  const prevStatus = queryClient.getQueryData<BookmarkStatus>(statusKey);
  const prevSavedEntries = queryClient.getQueriesData({
    queryKey: ["reader", "saved"],
  });

  queryClient.setQueryData<BookmarkStatus>(statusKey, {
    isBookmarked: bookmarked,
  });

  if (!bookmarked && wasBookmarked) {
    queryClient.setQueriesData({ queryKey: ["reader", "saved"] }, (saved) => {
      if (isSavedInfiniteData(saved)) {
        return removeFromSavedInfinite(saved, documentUri);
      }
      return saved;
    });
  }

  if (bookmarked !== wasBookmarked) {
    const delta = bookmarked ? 1 : -1;
    queryClient.setQueriesData({ queryKey: ["feed", "sidebar"] }, (data) => {
      if (!isSidebarData(data)) return data;
      return {
        ...data,
        savedCount: adjustSavedCount(data.savedCount, delta),
      } satisfies SidebarData;
    });
  }

  return { prevStatus, prevSavedEntries };
}

export function rollbackBookmarkOptimisticUpdate(
  queryClient: QueryClient,
  documentUri: string,
  context: BookmarkOptimisticContext,
) {
  const statusKey = ["reader", "bookmarkStatus", documentUri] as const;

  if (context.prevStatus) {
    queryClient.setQueryData(statusKey, context.prevStatus);
  } else {
    queryClient.removeQueries({ queryKey: statusKey });
  }

  for (const [key, data] of context.prevSavedEntries) {
    queryClient.setQueryData(key, data);
  }
}
