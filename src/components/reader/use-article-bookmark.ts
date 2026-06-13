"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { APP_NSID } from "#/lib/atproto/nsids";
import { isAtprotoScopeMissingError } from "#/lib/atproto/scope-error";
import { useLoginSearch } from "#/utils/use-login-search";

import {
  applyBookmarkOptimisticUpdate,
  rollbackBookmarkOptimisticUpdate,
} from "./bookmark-optimistic";

export function useArticleBookmark(
  documentUri: string,
  signedIn: boolean,
  opts?: { assumeBookmarked?: boolean },
) {
  const navigate = useNavigate();
  const loginSearch = useLoginSearch();
  const queryClient = useQueryClient();
  const assumeBookmarked = opts?.assumeBookmarked;

  const { data: status } = useQuery({
    ...readerApi.getBookmarkStatusQueryOptions(documentUri),
    enabled: signedIn && assumeBookmarked === undefined,
  });

  const bookmarkMutation = useMutation(
    readerApi.bookmarkDocumentMutationOptions(),
  );
  const unbookmarkMutation = useMutation(
    readerApi.unbookmarkDocumentMutationOptions(),
  );

  const bookmarked = assumeBookmarked ?? status?.isBookmarked ?? false;

  const toggle = () => {
    if (!signedIn) {
      void navigate({ to: "/login", search: loginSearch });
      return;
    }
    const next = !bookmarked;
    const optimistic = applyBookmarkOptimisticUpdate(
      queryClient,
      documentUri,
      next,
    );
    const mutation = next ? bookmarkMutation : unbookmarkMutation;
    mutation.mutate(documentUri, {
      onError: (error) => {
        rollbackBookmarkOptimisticUpdate(queryClient, documentUri, optimistic);
        if (isAtprotoScopeMissingError(error, APP_NSID.bookmark)) {
          void navigate({
            to: "/login",
            search: { ...loginSearch, error: "scope" },
          });
        }
      },
    });
  };

  const isPending = bookmarkMutation.isPending || unbookmarkMutation.isPending;

  return { bookmarked, toggle, isPending };
}
