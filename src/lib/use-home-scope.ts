import type { HomeScope } from "#/integrations/tanstack-query/api-feed.functions";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { useCallback } from "react";

import { DEFAULT_HOME_SCOPE } from "./home-scope";

export interface HomeScopeContextValue {
  scope: HomeScope;
  setScope: (next: HomeScope) => void;
  isPending: boolean;
}

/** Home feed scope preference — see `#/lib/home-scope`. */
export function useHomeScope(): HomeScopeContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getHomeScopePreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const scope = data?.scope ?? DEFAULT_HOME_SCOPE;

  const setMutation = useMutation({
    mutationFn: async (next: HomeScope) => {
      return await user.setHomeScopePreference({ data: { scope: next } });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getHomeScopePreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getHomeScopePreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(
        user.getHomeScopePreferenceQueryOptions.queryKey,
        { scope: next },
      );
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getHomeScopePreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getHomeScopePreferenceQueryOptions.queryKey,
        result,
      );
    },
  });

  const setScope = useCallback(
    (next: HomeScope) => {
      if (next === scope) return;
      setMutation.mutate(next);
    },
    [scope, setMutation],
  );

  return {
    scope,
    setScope,
    isPending: setMutation.isPending,
  };
}
