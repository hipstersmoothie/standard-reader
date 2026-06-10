import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { useCallback } from "react";

import type { ReadingTypographyPreference } from "./reading-typography";

import { DEFAULT_READING_TYPOGRAPHY } from "./reading-typography";

export interface ReadingTypographyContextValue {
  preference: ReadingTypographyPreference;
  setPreference: (patch: Partial<ReadingTypographyPreference>) => void;
  isPending: boolean;
}

/** Article reading typography — see `#/lib/reading-typography`. */
export function useReadingTypography(): ReadingTypographyContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getReadingTypographyPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const preference = data?.preference ?? DEFAULT_READING_TYPOGRAPHY;

  const setMutation = useMutation({
    mutationFn: async (next: ReadingTypographyPreference) => {
      return await user.setReadingTypographyPreference({
        data: { preference: next },
      });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getReadingTypographyPreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getReadingTypographyPreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(
        user.getReadingTypographyPreferenceQueryOptions.queryKey,
        { preference: next },
      );
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getReadingTypographyPreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getReadingTypographyPreferenceQueryOptions.queryKey,
        result,
      );
    },
  });

  const setPreference = useCallback(
    (patch: Partial<ReadingTypographyPreference>) => {
      const next = { ...preference, ...patch };
      if (
        next.fontSize === preference.fontSize &&
        next.measure === preference.measure &&
        next.bodyFont === preference.bodyFont
      ) {
        return;
      }
      setMutation.mutate(next);
    },
    [preference, setMutation],
  );

  return {
    preference,
    setPreference,
    isPending: setMutation.isPending,
  };
}
