import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

import { DEFAULT_ACCENT_COLOR } from "./accent-color-preference";

export interface AccentColorContextValue {
  /** A preset id, a `#rrggbb` hex, or `null` for the default editorial accent. */
  color: string | null;
  setColor: (next: string | null) => void;
  isPending: boolean;
}

/** App-wide accent color preference — see `#/lib/accent-color-preference`. */
export function useAccentColorPreference(): AccentColorContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getAccentColorPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const color = data?.color ?? DEFAULT_ACCENT_COLOR;

  const setMutation = useMutation({
    mutationFn: async (next: string | null) => {
      return await user.setAccentColorPreference({ data: { color: next } });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getAccentColorPreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getAccentColorPreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(
        user.getAccentColorPreferenceQueryOptions.queryKey,
        { color: next },
      );
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getAccentColorPreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getAccentColorPreferenceQueryOptions.queryKey,
        result,
      );
    },
  });

  const setColor = useCallback(
    (next: string | null) => {
      if (next === color) return;
      setMutation.mutate(next);
    },
    [color, setMutation],
  );

  return {
    color,
    setColor,
    isPending: setMutation.isPending,
  };
}
