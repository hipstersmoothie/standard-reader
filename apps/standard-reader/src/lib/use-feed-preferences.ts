"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

import type { FeedPagination } from "./feed-preferences";
import {
  DEFAULT_FEED_PAGINATION,
  DEFAULT_HIDE_FEED_METRICS,
} from "./feed-preferences";

export interface HideFeedMetricsContextValue {
  hidden: boolean;
  setHidden: (next: boolean) => void;
  isPending: boolean;
}

/** "Hide engagement counts" preference — see `#/lib/feed-preferences`. */
export function useHideFeedMetrics(): HideFeedMetricsContextValue {
  const queryClient = useQueryClient();
  const queryKey = user.getHideFeedMetricsPreferenceQueryOptions.queryKey;

  const { data } = useQuery({
    ...user.getHideFeedMetricsPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const hidden = data?.hidden ?? DEFAULT_HIDE_FEED_METRICS;

  const setMutation = useMutation({
    mutationFn: async (next: boolean) =>
      await user.setHideFeedMetricsPreference({ data: { hidden: next } }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, { hidden: next });
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
    },
  });

  const setHidden = useCallback(
    (next: boolean) => {
      if (next === hidden) return;
      setMutation.mutate(next);
    },
    [hidden, setMutation],
  );

  return { hidden, setHidden, isPending: setMutation.isPending };
}

/**
 * Whether engagement counts should render at all. The inverse of
 * {@link useHideFeedMetrics}, for the many read-only call sites that only ever
 * ask "do I draw this number (and its separator dot)?".
 */
export function useFeedMetricsVisible(): boolean {
  const { data } = useQuery({
    ...user.getHideFeedMetricsPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  return !(data?.hidden ?? DEFAULT_HIDE_FEED_METRICS);
}

export interface FeedPaginationContextValue {
  mode: FeedPagination;
  setMode: (next: FeedPagination) => void;
  isPending: boolean;
}

/** "Pagination" preference — see `#/lib/feed-preferences`. */
export function useFeedPagination(): FeedPaginationContextValue {
  const queryClient = useQueryClient();
  const queryKey = user.getFeedPaginationPreferenceQueryOptions.queryKey;

  const { data } = useQuery({
    ...user.getFeedPaginationPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const mode = data?.mode ?? DEFAULT_FEED_PAGINATION;

  const setMutation = useMutation({
    mutationFn: async (next: FeedPagination) =>
      await user.setFeedPaginationPreference({ data: { mode: next } }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, { mode: next });
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
    },
  });

  const setMode = useCallback(
    (next: FeedPagination) => {
      if (next === mode) return;
      setMutation.mutate(next);
    },
    [mode, setMutation],
  );

  return { mode, setMode, isPending: setMutation.isPending };
}
