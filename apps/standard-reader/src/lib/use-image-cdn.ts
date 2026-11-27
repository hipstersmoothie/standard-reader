import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { user } from "#/integrations/tanstack-query/api-user.functions";

import type { ImageCdnId } from "./image-cdn";
import { DEFAULT_IMAGE_CDN, rewriteImageCdnUrl } from "./image-cdn";

export interface ImageCdnContextValue {
  cdn: ImageCdnId;
  setCdn: (next: ImageCdnId) => void;
  isPending: boolean;
}

/**
 * "Image server" preference — see `#/lib/image-cdn`. Seeded by the shell
 * bootstrap, so the value is the same during SSR and on hydration.
 *
 * Changing it needs no query invalidation: server responses always carry
 * Bluesky CDN URLs, and the swap happens at render time.
 */
export function useImageCdn(): ImageCdnContextValue {
  const queryClient = useQueryClient();
  const { queryKey } = user.getImageCdnPreferenceQueryOptions;

  const { data } = useQuery({
    ...user.getImageCdnPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const cdn = data?.cdn ?? DEFAULT_IMAGE_CDN;

  const setMutation = useMutation({
    mutationFn: async (next: ImageCdnId) => {
      return await user.setImageCdnPreference({ data: { cdn: next } });
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, { cdn: next });
      return { previous };
    },
    onError: (_error, _next, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
    },
  });

  const setCdn = useCallback(
    (next: ImageCdnId) => {
      if (next === cdn) return;
      setMutation.mutate(next);
    },
    [cdn, setMutation],
  );

  return { cdn, setCdn, isPending: setMutation.isPending };
}

/**
 * The `src` rewrite for the design system's `ImageSrcProvider`, stable per
 * chosen host so image consumers only re-render when it changes.
 */
export function useImageCdnTransform(): (src: string) => string {
  const { data } = useQuery({
    ...user.getImageCdnPreferenceQueryOptions,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const cdn = data?.cdn ?? DEFAULT_IMAGE_CDN;
  return useMemo(() => (src: string) => rewriteImageCdnUrl(src, cdn), [cdn]);
}
