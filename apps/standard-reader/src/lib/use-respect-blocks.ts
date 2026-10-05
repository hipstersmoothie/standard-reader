import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

export interface RespectBlocksContextValue {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  isPending: boolean;
}

/**
 * "Hide blocked accounts" preference — whether the reader's Bluesky blocks hide
 * content here. Stored as `user.respect_blocks`; see `readerHasBlocks` in
 * `#/server/blocks/blocks` for where it takes effect.
 */
export function useRespectBlocks(): RespectBlocksContextValue {
  const queryClient = useQueryClient();
  const { queryKey } = user.getRespectBlocksPreferenceQueryOptions;

  const { data } = useQuery({
    ...user.getRespectBlocksPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const enabled = data?.enabled ?? true;

  const setMutation = useMutation({
    mutationFn: async (next: boolean) => {
      return await user.setRespectBlocksPreference({ data: { enabled: next } });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, { enabled: next });
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
      // Blocks reach feeds, search, discussion, profiles and publication pages
      // alike, so — as after a block itself — there is no narrower key worth
      // invalidating than everything but this preference.
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== queryKey[0],
      });
    },
  });

  const setEnabled = useCallback(
    (next: boolean) => {
      if (next === enabled) return;
      setMutation.mutate(next);
    },
    [enabled, setMutation],
  );

  return { enabled, setEnabled, isPending: setMutation.isPending };
}
