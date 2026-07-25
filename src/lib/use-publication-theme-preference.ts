import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

import { DEFAULT_USE_PUBLICATION_THEME } from "./publication-theme-preference";

export interface UsePublicationThemeContextValue {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  isPending: boolean;
}

/** "Use publication themes" preference — see `#/lib/publication-theme-preference`. */
export function usePublicationThemePreference(): UsePublicationThemeContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getUsePublicationThemePreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const enabled = data?.enabled ?? DEFAULT_USE_PUBLICATION_THEME;

  const setMutation = useMutation({
    mutationFn: async (next: boolean) => {
      return await user.setUsePublicationThemePreference({
        data: { enabled: next },
      });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getUsePublicationThemePreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getUsePublicationThemePreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(
        user.getUsePublicationThemePreferenceQueryOptions.queryKey,
        { enabled: next },
      );
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getUsePublicationThemePreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getUsePublicationThemePreferenceQueryOptions.queryKey,
        result,
      );
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
