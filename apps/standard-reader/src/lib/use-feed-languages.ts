import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

import type { ContentLanguageCode } from "./content-language";
import { DEFAULT_FEED_LANGUAGES } from "./content-language";

export interface FeedLanguagesContextValue {
  /** Chosen languages, in catalog order. Empty = no filter (the default). */
  languages: Array<ContentLanguageCode>;
  setLanguages: (next: ReadonlyArray<ContentLanguageCode>) => void;
  isPending: boolean;
}

/**
 * "Languages" feed preference — see `#/lib/content-language`.
 *
 * Mirrors `useExcludeWebBridge`: optimistic, server-authoritative on success,
 * and invalidating every network-wide cache afterwards, because the rows those
 * queries returned are now the wrong rows rather than merely a stale count.
 */
export function useFeedLanguages(): FeedLanguagesContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getFeedLanguagesPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const languages = data?.languages ?? [...DEFAULT_FEED_LANGUAGES];

  const setMutation = useMutation({
    mutationFn: async (next: ReadonlyArray<ContentLanguageCode>) => {
      return await user.setFeedLanguagesPreference({
        data: { languages: [...next] },
      });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getFeedLanguagesPreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getFeedLanguagesPreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(
        user.getFeedLanguagesPreferenceQueryOptions.queryKey,
        { languages: [...next] },
      );
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getFeedLanguagesPreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getFeedLanguagesPreferenceQueryOptions.queryKey,
        result,
      );
      // Every network-wide surface is filtered server-side, so each of their
      // caches now holds rows that no longer match the preference.
      for (const key of [
        ["feed"],
        ["discover"],
        ["tag"],
        ["search"],
        ["topics"],
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });

  const setLanguages = useCallback(
    (next: ReadonlyArray<ContentLanguageCode>) => {
      setMutation.mutate(next);
    },
    [setMutation],
  );

  return {
    languages,
    setLanguages,
    isPending: setMutation.isPending,
  };
}
