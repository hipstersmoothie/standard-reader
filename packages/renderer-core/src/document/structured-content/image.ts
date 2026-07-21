import { blobCid } from "../../atproto/blob";
import {
  aspectRatioFromDimensions,
  blobImageUrl,
  externalHttpUrl,
  isRecord,
} from "../../internal";
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

export function structuredImageUrl(
  block: {
    blob?: unknown;
    externalSrc?: string;
  },
  did: string,
): string | null {
  const external = externalHttpUrl(block.externalSrc);
  if (external) return external;
  return blobImageUrl(block.blob, did);
}

export function structuredImageAspectRatio(block: {
  aspectRatio?: { width?: number; height?: number };
}): number {
  return aspectRatioFromDimensions(
    block.aspectRatio?.width,
    block.aspectRatio?.height,
  );
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
