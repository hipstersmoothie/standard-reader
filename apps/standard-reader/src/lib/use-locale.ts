import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

import type { Locale, TextDirection } from "./locale";
import { DEFAULT_LOCALE, directionForLocale } from "./locale";

export interface LocaleContextValue {
  locale: Locale;
  direction: TextDirection;
  setLocale: (next: Locale) => void;
  isPending: boolean;
}

export function useLocale(): LocaleContextValue {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    ...user.getLocalePreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const locale = data?.locale ?? DEFAULT_LOCALE;

  const setMutation = useMutation({
    mutationFn: async (next: Locale) => {
      return await user.setLocalePreference({ data: { locale: next } });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({
        queryKey: user.getLocalePreferenceQueryOptions.queryKey,
      });
      const previous = queryClient.getQueryData(
        user.getLocalePreferenceQueryOptions.queryKey,
      );
      queryClient.setQueryData(user.getLocalePreferenceQueryOptions.queryKey, {
        locale: next,
      });
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          user.getLocalePreferenceQueryOptions.queryKey,
          ctx.previous,
        );
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        user.getLocalePreferenceQueryOptions.queryKey,
        result,
      );
    },
  });

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      setMutation.mutate(next);
    },
    [locale, setMutation],
  );

  return {
    locale,
    direction: directionForLocale(locale),
    setLocale,
    isPending: setMutation.isPending,
  };
}
