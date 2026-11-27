"use client";

import { createContext, use, useCallback } from "react";

/**
 * Rewrites an image URL just before it reaches an `<img src>` — e.g. to load
 * images from a different (but path-compatible) CDN host. Must be pure and
 * idempotent: it can run more than once over the same URL, and on the server
 * and the client alike, so the same input has to give the same output or
 * hydration will mismatch.
 */
export type ImageSrcTransform = (src: string) => string;

/** Applies the active {@link ImageSrcTransform}; empty values pass through. */
export type ImageSrcResolver = <T extends string | null | undefined>(
  src: T,
) => T;

const identity: ImageSrcTransform = (src) => src;

export const ImageSrcContext = createContext<ImageSrcTransform>(identity);

/**
 * The active image source rewrite (identity when no provider is mounted), for
 * components that render several images or images inside a `.map()`. Stable
 * for as long as the provider's `transform` is.
 */
export function useResolveImageSrc(): ImageSrcResolver {
  const transform = use(ImageSrcContext);
  return useCallback(
    <T extends string | null | undefined>(src: T): T =>
      (src ? transform(src) : src) as T,
    [transform],
  );
}

/** Apply the active image source rewrite to one optional `src`. */
export function useImageSrc<T extends string | null | undefined>(src: T): T {
  const transform = use(ImageSrcContext);
  return (src ? transform(src) : src) as T;
}
