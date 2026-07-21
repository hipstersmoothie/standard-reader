"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { useLoginSearch } from "#/utils/use-login-search";

import {
  applyMarkReadOptimisticUpdate,
  applyMarkUnreadOptimisticUpdate,
  invalidateReadQueries,
} from "./read-optimistic";

/**
 * Manual read/unread toggle for a single article. Mirrors {@link useArticleBookmark}:
 * optimistic cache flip + repo write, reconciling from the server on error.
 *
 * The article view auto-marks a document read on open, so `isRead` defaults to
 * true here — the toggle's main job is letting a reader push an article back to
 * unread (or re-mark it read after that).
 */
export function useArticleReadToggle(
  documentUri: string,
  {
    signedIn,
    publicationUri,
  }: {
    signedIn: boolean;
    publicationUri?: string | null;
  },
) {
  const navigate = useNavigate();
  const loginSearch = useLoginSearch();
  const queryClient = useQueryClient();

  // Don't fetch: the article view auto-marks the document read on mount and seeds
  // `["reader","readStatus",uri]` optimistically, so we read that cache directly.
  // A background fetch could momentarily return the pre-write server value (false)
  // and flicker the button, so `enabled: false` keeps us on the optimistic state.
  const { data: status } = useQuery({
    ...readerApi.getReadStatusQueryOptions(documentUri),
    enabled: false,
  });

  const markReadMutation = useMutation(readerApi.markReadMutationOptions());
  const markUnreadMutation = useMutation(readerApi.markUnreadMutationOptions());

  // Opening the article marks it read, so treat unknown state as read.
  const isRead = status?.isRead ?? true;

  const toggle = () => {
    if (!signedIn) {
      void navigate({ to: "/login", search: loginSearch });
      return;
    }

    if (isRead) {
      applyMarkUnreadOptimisticUpdate(queryClient, documentUri, publicationUri);
      markUnreadMutation.mutate(documentUri, {
        onError: () => invalidateReadQueries(queryClient),
      });
    } else {
      applyMarkReadOptimisticUpdate(queryClient, documentUri, publicationUri);
      markReadMutation.mutate(documentUri, {
        onError: () => invalidateReadQueries(queryClient),
      });
    }
  };

  const isPending = markReadMutation.isPending || markUnreadMutation.isPending;

  return { isRead, toggle, isPending };
}
