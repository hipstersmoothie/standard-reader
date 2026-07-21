/**
 * Small internal helpers shared across the format parsers and the render-tree
 * builder. Deliberately not re-exported from `index.ts` — these are
 * implementation details, not part of the package's public API.
 *
 * This module has no local dependencies beyond {@link ./atproto/blob}, so it
 * stays a leaf in the import graph and can be pulled in anywhere without
 * risking a cycle.
 */

import { blobCid, cdnImageUrl } from "./atproto/blob";

/** Narrow to a plain (non-array) object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value unchanged when it is an absolute `http(s)` URL string, else null. */
export function externalHttpUrl(value: unknown): string | null {
  return typeof value === "string" && /^https?:\/\//i.test(value)
    ? value
    : null;
}

/**
 * Width ÷ height for image layout. Returns {@link fallback} (16∶9 by default)
 * when either dimension is missing, non-numeric, or non-positive.
 */
export function aspectRatioFromDimensions(
  width: unknown,
  height: unknown,
  fallback = 16 / 9,
): number {
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0
  ) {
    return width / height;
  }
  return fallback;
}

/**
 * Build a Bluesky CDN image URL from a blob ref + the repo's DID. Returns null
 * when the blob carries no CID. PNG is requested to preserve alpha.
 */
export function blobImageUrl(blob: unknown, did: string): string | null {
  const cid = blobCid(blob as Parameters<typeof blobCid>[0]);
  if (!cid) return null;
  return cdnImageUrl(did, cid, "png");
}
