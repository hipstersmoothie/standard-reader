import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateReadQueries } from "#/components/reader/read-optimistic";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { useCallback } from "react";

import { DEFAULT_TRACK_READING_HISTORY } from "./track-reading-history";

export interface TrackReadingHistoryContextValue {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  isPending: boolean;
}

/** "Track reading history" preference — see `#/lib/track-reading-history`. */
export function useTrackReadingHistory(): TrackReadingHistoryContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getTrackReadingHistoryPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const enabled = data?.enabled ?? DEFAULT_TRACK_READING_HISTORY;

  const setMutation = useMutation({
    mutationFn: async (next: boolean) => {
      return await user.setTrackReadingHistoryPreference({
        data: { enabled: next },
      });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getTrackReadingHistoryPreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getTrackReadingHistoryPreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(
        user.getTrackReadingHistoryPreferenceQueryOptions.queryKey,
        { enabled: next },
      );
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getTrackReadingHistoryPreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getTrackReadingHistoryPreferenceQueryOptions.queryKey,
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
