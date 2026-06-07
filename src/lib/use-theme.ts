import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { useCallback, useEffect, useState } from "react";

import type { ResolvedThemeScheme, ThemeMode } from "./theme";

import {
  DEFAULT_THEME_MODE,
  getSystemColorScheme,
  readInitialSystemColorScheme,
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

  const [systemScheme, setSystemScheme] = useState<ResolvedThemeScheme>(
    readInitialSystemColorScheme,
  );

  useEffect(() => {
    setSystemScheme(getSystemColorScheme());

    if (typeof globalThis.matchMedia !== "function") return;

    const media = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const listener = (event: MediaQueryListEvent) => {
      const next = event.matches ? "dark" : "light";
      setSystemScheme(next);
      globalThis.document.documentElement.dataset.resolvedScheme = next;
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

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
      if (globalThis.document !== undefined) {
        const resolved =
          next === "system" ? readInitialSystemColorScheme() : next;
        globalThis.document.documentElement.dataset.resolvedScheme = resolved;
      }
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

  const resolvedScheme: ResolvedThemeScheme =
    mode === "system" ? systemScheme : mode;

  return {
    mode,
    resolvedScheme,
    setMode,
    isPending: setMutation.isPending,
  };
}
