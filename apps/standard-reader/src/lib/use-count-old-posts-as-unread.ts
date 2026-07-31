import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { invalidateReadQueries } from "#/components/reader/read-optimistic";
import { user } from "#/integrations/tanstack-query/api-user.functions";

import { DEFAULT_COUNT_OLD_POSTS_AS_UNREAD } from "./count-old-posts-as-unread";

export interface CountOldPostsAsUnreadContextValue {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  isPending: boolean;
}

/** "Count old posts as unread" preference — see `#/lib/count-old-posts-as-unread`. */
export function useCountOldPostsAsUnread(): CountOldPostsAsUnreadContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getCountOldPostsAsUnreadPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const enabled = data?.enabled ?? DEFAULT_COUNT_OLD_POSTS_AS_UNREAD;

  const setMutation = useMutation({
    mutationFn: async (next: boolean) => {
      return await user.setCountOldPostsAsUnreadPreference({
        data: { enabled: next },
      });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getCountOldPostsAsUnreadPreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getCountOldPostsAsUnreadPreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(
        user.getCountOldPostsAsUnreadPreferenceQueryOptions.queryKey,
        { enabled: next },
      );
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getCountOldPostsAsUnreadPreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getCountOldPostsAsUnreadPreferenceQueryOptions.queryKey,
        result,
      );
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
      invalidateReadQueries(queryClient);
    },
  });

  const setEnabled = useCallback(
    (next: boolean) => {
      if (next === enabled) return;
      setMutation.mutate(next);
    },
    [enabled, setMutation],
  );

  return {
    enabled,
    setEnabled,
    isPending: setMutation.isPending,
  };
}
