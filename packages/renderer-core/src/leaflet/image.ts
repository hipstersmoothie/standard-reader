import { blobCid } from "../atproto/blob";
import { aspectRatioFromDimensions, blobImageUrl } from "../internal";
import type { LeafletImageBlock } from "./types";

/** Pull the CID string from a leaflet `image` blob field. */
export function leafletImageCid(image: unknown): string | null {
  return blobCid(image as Parameters<typeof blobCid>[0]);
}

/** Build a Bluesky CDN image URL for a leaflet `image` blob. Returns null when
 *  the blob ref is missing. PNG is used to preserve alpha. */
export function leafletImageUrl(
  block: LeafletImageBlock,
  did: string,
): string | null {
  return blobImageUrl(block.image, did);
}

/** Width ÷ height for layout; falls back to 16∶9 when missing or invalid. */
export function leafletImageAspectRatio(block: LeafletImageBlock): number {
  return aspectRatioFromDimensions(
    block.aspectRatio?.width,
    block.aspectRatio?.height,
  );
}
