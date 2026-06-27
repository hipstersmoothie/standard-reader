import { blobCid, cdnImageUrl } from "#/server/atproto/blob";

import type { StructuredGridImage } from "./types";

/** First non-empty trimmed string from format-specific alt/caption/title fields. */
export function normalizeImageAlt(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** Plaintext lines for the page reader when an image block carries alt text. */
export function narrationImageLines(
  ...candidates: Array<string | null | undefined>
): Array<string> {
  const alt = normalizeImageAlt(...candidates);
  return alt ? [alt] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Build a Bluesky CDN image URL for an offprint/structured blob ref. */
export function blobImageUrl(
  blob: unknown,
  did: string,
  pds: string | null | undefined,
): string | null {
  const cid = blobCid(blob as Parameters<typeof blobCid>[0]);
  if (!cid || !pds) return null;
  return cdnImageUrl(did, cid, "png");
}

export function structuredImageUrl(
  block: {
    blob?: unknown;
    externalSrc?: string;
  },
  did: string,
  pds: string | null | undefined,
): string | null {
  if (block.externalSrc && /^https?:\/\//i.test(block.externalSrc)) {
    return block.externalSrc;
  }
  return blobImageUrl(block.blob, did, pds);
}

export function structuredImageAspectRatio(block: {
  aspectRatio?: { width?: number; height?: number };
}): number {
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

export function structuredImageHasSource(block: {
  blob?: unknown;
  externalSrc?: string;
}): boolean {
  if (block.externalSrc?.trim()) return true;
  if (!isRecord(block.blob) && block.blob == null) return false;
  return blobCid(block.blob as Parameters<typeof blobCid>[0]) != null;
}

function parseAspectRatio(
  value: unknown,
): { width?: number; height?: number } | undefined {
  if (!isRecord(value)) return undefined;
  return {
    width: typeof value.width === "number" ? value.width : undefined,
    height: typeof value.height === "number" ? value.height : undefined,
  };
}

/** Parse Offprint `#gridImage` entries (`blob` or legacy `image` field). */
export function parseStructuredGridImage(
  value: unknown,
): StructuredGridImage | null {
  if (!isRecord(value)) return null;
  const blob = value.blob ?? value.image;
  if (!structuredImageHasSource({ blob })) return null;
  return {
    blob,
    alt:
      normalizeImageAlt(
        typeof value.alt === "string" ? value.alt : undefined,
      ) || undefined,
    aspectRatio: parseAspectRatio(value.aspectRatio),
  };
}
