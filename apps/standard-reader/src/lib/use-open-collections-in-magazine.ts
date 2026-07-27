import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

import { DEFAULT_OPEN_COLLECTIONS_IN_MAGAZINE } from "./open-collections-in-magazine";

export interface OpenCollectionsInMagazineContextValue {
  openInMagazine: boolean;
  setOpenInMagazine: (next: boolean) => void;
  /** Opt into magazine-first navigation (e.g. when opening an edition). */
  rememberOpenInMagazine: () => void;
  isPending: boolean;
}

/** Collection posts open in the magazine edition when enabled. */
export function useOpenCollectionsInMagazine(): OpenCollectionsInMagazineContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getOpenCollectionsInMagazinePreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const openInMagazine =
    data?.openInMagazine ?? DEFAULT_OPEN_COLLECTIONS_IN_MAGAZINE;

  const setMutation = useMutation({
    mutationFn: async (next: boolean) => {
      return await user.setOpenCollectionsInMagazinePreference({
        data: { openInMagazine: next },
      });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey:
          user.getOpenCollectionsInMagazinePreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getOpenCollectionsInMagazinePreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(
        user.getOpenCollectionsInMagazinePreferenceQueryOptions.queryKey,
        { openInMagazine: next },
      );
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getOpenCollectionsInMagazinePreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getOpenCollectionsInMagazinePreferenceQueryOptions.queryKey,
        result,
      );
    },
  });

  const setOpenInMagazine = useCallback(
    (next: boolean) => {
      if (next === openInMagazine) return;
      setMutation.mutate(next);
    },
    [openInMagazine, setMutation],
  );

  const rememberOpenInMagazine = useCallback(() => {
    if (!openInMagazine) {
      setMutation.mutate(true);
    }
  }, [openInMagazine, setMutation]);

  return {
    openInMagazine,
    setOpenInMagazine,
    rememberOpenInMagazine,
    isPending: setMutation.isPending,
  };
}
