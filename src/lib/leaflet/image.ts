import { blobCid, cdnImageUrl } from "#/server/atproto/blob";

import type { LeafletImageBlock } from "./types";

/** Pull the CID string from a leaflet `image` blob field. */
export function leafletImageCid(image: unknown): string | null {
  return blobCid(image as Parameters<typeof blobCid>[0]);
}

/** Build a Bluesky CDN image URL for a leaflet `image` blob. Returns null when
 *  the blob ref or PDS is missing. PNG is used to preserve alpha. */
export function leafletImageUrl(
  block: LeafletImageBlock,
  did: string,
  pds: string | null | undefined,
): string | null {
  const cid = leafletImageCid(block.image);
  if (!cid || !pds) return null;
  return cdnImageUrl(did, cid, "png");
}

/** Width ÷ height for layout; falls back to 16∶9 when missing or invalid. */
export function leafletImageAspectRatio(block: LeafletImageBlock): number {
  const width = block.aspectRatio?.width;
  const height = block.aspectRatio?.height;
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0
  ) {
    return width / height;
  }
  return 16 / 9;
}
