import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

import type { AppearancePreference } from "./appearance";
import { DEFAULT_APPEARANCE, normalizeAppearance } from "./appearance";

export interface AppearanceContextValue {
  preference: AppearancePreference;
  setPreference: (patch: Partial<AppearancePreference>) => void;
  reset: () => void;
  isPending: boolean;
}

/**
 * Palette + shape/type preferences — see `#/lib/appearance`.
 *
 * Optimistic like the other preference hooks: the cache is updated before the
 * round trip, so the whole app repaints on the same frame as the click. The app
 * *is* the preview, which is only honest if it keeps up.
 */
export function useAppearance(): AppearanceContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getAppearancePreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const preference = data?.preference ?? DEFAULT_APPEARANCE;

  const setMutation = useMutation({
    mutationFn: async (next: AppearancePreference) => {
      return await user.setAppearancePreference({ data: { preference: next } });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getAppearancePreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getAppearancePreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(
        user.getAppearancePreferenceQueryOptions.queryKey,
        { preference: next },
      );
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getAppearancePreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getAppearancePreferenceQueryOptions.queryKey,
        result,
      );
    },
  });

  const commit = useCallback(
    (next: AppearancePreference) => {
      const normalized = normalizeAppearance(next);
      const current = normalizeAppearance(preference);
      if (
        normalized.palette === current.palette &&
        normalized.customPaper === current.customPaper &&
        normalized.customAccent === current.customAccent &&
        normalized.font === current.font &&
        normalized.customFontFamily === current.customFontFamily &&
        normalized.textSize === current.textSize &&
        normalized.roundness === current.roundness &&
        normalized.density === current.density
      ) {
        return;
      }
      setMutation.mutate(normalized);
    },
    [preference, setMutation],
  );

  const setPreference = useCallback(
    (patch: Partial<AppearancePreference>) => {
      commit({ ...preference, ...patch });
    },
    [commit, preference],
  );

  const reset = useCallback(() => {
    commit(DEFAULT_APPEARANCE);
  }, [commit]);

  return {
    preference,
    setPreference,
    reset,
    isPending: setMutation.isPending,
  };
}
