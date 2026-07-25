import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

import { DEFAULT_APPEARANCE, appearanceScheme } from "./appearance";
import type { ResolvedThemeScheme, ThemeMode } from "./theme";
import {
  DEFAULT_THEME_MODE,
  resolveSchemeForMode,
  resolvedSchemeServerSnapshot,
  subscribeToResolvedScheme,
} from "./theme";

export interface ThemeContextValue {
  mode: ThemeMode;
  resolvedScheme: ResolvedThemeScheme;
  setMode: (next: ThemeMode) => void;
  isPending: boolean;
}

export function useTheme(): ThemeContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getThemePreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const mode = data?.mode ?? DEFAULT_THEME_MODE;

  // A custom palette states its own light/dark, so the resolved scheme comes
  // from the palette rather than the OS. Seeded by the shell bootstrap, so this
  // is already correct during SSR — no hydration mismatch for the components
  // that key off `resolvedScheme` (code highlighting, embeds).
  const { data: appearanceData } = useQuery({
    ...user.getAppearancePreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const paletteScheme = appearanceScheme(
    appearanceData?.preference ?? DEFAULT_APPEARANCE,
  );

  const resolvedScheme = useSyncExternalStore(
    subscribeToResolvedScheme,
    () => resolveSchemeForMode(mode, paletteScheme),
    () => resolvedSchemeServerSnapshot(mode, paletteScheme),
  );

  const setMutation = useMutation({
    mutationFn: async (next: ThemeMode) => {
      return await user.setThemePreference({ data: { mode: next } });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getThemePreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getThemePreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(user.getThemePreferenceQueryOptions.queryKey, {
        mode: next,
      });
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getThemePreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getThemePreferenceQueryOptions.queryKey,
        result,
      );
      void queryClient.invalidateQueries({ queryKey: ["article"] });
      void queryClient.invalidateQueries({ queryKey: ["code-highlight"] });
    },
  });

  const setMode = useCallback(
    (next: ThemeMode) => {
      if (next === mode) return;
      setMutation.mutate(next);
    },
    [mode, setMutation],
  );

  return {
    mode,
    resolvedScheme,
    setMode,
    isPending: setMutation.isPending,
  };
}
