import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

import { DEFAULT_EXCLUDE_WEB_BRIDGE } from "./exclude-web-bridge";

export interface ExcludeWebBridgeContextValue {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  isPending: boolean;
}

/** "Hide mirrored websites" preference — see `#/lib/exclude-web-bridge`. */
export function useExcludeWebBridge(): ExcludeWebBridgeContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getExcludeWebBridgePreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const enabled = data?.enabled ?? DEFAULT_EXCLUDE_WEB_BRIDGE;

  const setMutation = useMutation({
    mutationFn: async (next: boolean) => {
      return await user.setExcludeWebBridgePreference({
        data: { enabled: next },
      });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getExcludeWebBridgePreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getExcludeWebBridgePreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(
        user.getExcludeWebBridgePreferenceQueryOptions.queryKey,
        { enabled: next },
      );
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getExcludeWebBridgePreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getExcludeWebBridgePreferenceQueryOptions.queryKey,
        result,
      );
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
