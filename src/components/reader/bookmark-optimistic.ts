import type { QueryClient } from "@tanstack/react-query";

import type {
  BookmarkStatus,
  SavedArticleItem,
} from "../../integrations/tanstack-query/api-reader.functions";

export interface BookmarkOptimisticContext {
  prevStatus: BookmarkStatus | undefined;
  prevSavedEntries: Array<[readonly unknown[], unknown]>;
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
    queryClient.setQueriesData<Array<SavedArticleItem>>(
      { queryKey: ["reader", "saved"] },
      (saved) =>
        saved?.filter((item) => item.documentUri !== documentUri) ?? saved,
    );
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
