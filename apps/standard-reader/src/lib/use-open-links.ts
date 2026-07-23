import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

import { DEFAULT_OPEN_LINKS_EXTERNALLY } from "./open-links";

export interface OpenLinksContextValue {
  openExternally: boolean;
  setOpenExternally: (next: boolean) => void;
  isPending: boolean;
}

/** "Open on original site" preference — see `#/lib/open-links`. */
export function useOpenLinks(): OpenLinksContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getOpenLinksPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const openExternally = data?.openExternally ?? DEFAULT_OPEN_LINKS_EXTERNALLY;

  const setMutation = useMutation({
    mutationFn: async (next: boolean) => {
      return await user.setOpenLinksPreference({
        data: { openExternally: next },
      });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getOpenLinksPreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getOpenLinksPreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(
        user.getOpenLinksPreferenceQueryOptions.queryKey,
        {
          openExternally: next,
        },
      );
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getOpenLinksPreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getOpenLinksPreferenceQueryOptions.queryKey,
        result,
      );
    },
  });

  const setOpenExternally = useCallback(
    (next: boolean) => {
      if (next === openExternally) return;
      setMutation.mutate(next);
    },
    [openExternally, setMutation],
  );

  return {
    openExternally,
    setOpenExternally,
    isPending: setMutation.isPending,
  };
}
