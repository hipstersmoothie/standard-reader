"use client";

import type { ImageSrcTransform } from "./context";
import { ImageSrcContext } from "./context";

export type { ImageSrcResolver, ImageSrcTransform } from "./context";
// The hooks live in `./context` (no components, so fast refresh is unaffected);
// re-exported here so consumers have one import path for the whole API.
// eslint-disable-next-line react/only-export-components
export { useImageSrc, useResolveImageSrc } from "./context";

export interface ImageSrcProviderProps {
  /** The rewrite to apply to every image source below this provider. */
  transform: ImageSrcTransform;
  children: React.ReactNode;
}

/**
 * Install an {@link ImageSrcTransform} for every design-system image component
 * (`Avatar`, `Lightbox`, `AspectRatioImage`, `EmptyStateImage`) below it.
 * Components outside the design system read it with `useResolveImageSrc` or
 * `useImageSrc`. Memoize `transform` — a new function re-renders every
 * consumer.
 */
export function ImageSrcProvider({
  transform,
  children,
}: ImageSrcProviderProps) {
  return <ImageSrcContext value={transform}>{children}</ImageSrcContext>;
}
