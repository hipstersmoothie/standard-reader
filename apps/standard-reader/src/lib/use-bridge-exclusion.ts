import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";
import type { BridgeExclusion } from "#/lib/atproto/bridged-repo";

import {
  bridgeExclusionToKey,
  DEFAULT_BRIDGE_EXCLUSION,
} from "./exclude-web-bridge";

export interface BridgeExclusionContextValue {
  exclusion: BridgeExclusion;
  setExclusion: (next: BridgeExclusion) => void;
  isPending: boolean;
}

/** "Bridged accounts" preference — see `#/lib/exclude-web-bridge`. */
export function useBridgeExclusion(): BridgeExclusionContextValue {
  const queryClient = useQueryClient();
  const { queryKey } = user.getBridgeExclusionPreferenceQueryOptions;

  const { data } = useQuery({
    ...user.getBridgeExclusionPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const exclusion = data?.exclusion ?? DEFAULT_BRIDGE_EXCLUSION;

  const setMutation = useMutation({
    mutationFn: async (next: BridgeExclusion) => {
      return await user.setBridgeExclusionPreference({
        data: { exclusion: bridgeExclusionToKey(next) },
      });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, { exclusion: next });
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
      // Every network-wide surface is filtered server-side, so each of their
      // caches is now stale — the rows themselves changed, not just a count.
      for (const key of [
        ["feed"],
        ["discover"],
        ["tag"],
        ["search"],
        ["publication"],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  const setExclusion = useCallback(
    (next: BridgeExclusion) => {
      if (next === exclusion) return;
      setMutation.mutate(next);
    },
    [exclusion, setMutation],
  );

  return { exclusion, setExclusion, isPending: setMutation.isPending };
}
