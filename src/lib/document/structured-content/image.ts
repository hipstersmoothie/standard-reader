import { blobCid, getBlobUrl } from "#/server/atproto/blob";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Build a blob URL for leaflet/offprint-style image blob fields. */
export function blobImageUrl(
  blob: unknown,
  did: string,
  pds: string | null | undefined,
): string | null {
  const cid = blobCid(blob as Parameters<typeof blobCid>[0]);
  if (!cid || !pds) return null;
  return getBlobUrl(pds, did, cid);
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
