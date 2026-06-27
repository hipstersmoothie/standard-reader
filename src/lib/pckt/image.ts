import { normalizeImageAlt } from "#/lib/document/structured-content/image";
import { cdnImageUrl, blobCid as sharedBlobCid } from "#/server/atproto/blob";

import type { PcktImageBlock } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function blobCid(blob: unknown): string | null {
  return sharedBlobCid(blob as Parameters<typeof sharedBlobCid>[0]);
}

/** Pull a CID from `blob:CID` src strings or blob refs. */
function cidFromSrc(src: string): string | null {
  if (src.startsWith("blob:")) return src.slice("blob:".length) || null;
  return null;
}

/** Build a Bluesky CDN image URL for a pckt image blob, or return an external
 *  `https:` src unchanged. Returns null when no source can be resolved. */
export function pcktImageUrl(
  block: PcktImageBlock,
  did: string,
): string | null {
  const attrs = block.attrs;
  if (!attrs) return null;

  const src = attrs.src;
  if (typeof src === "string" && /^https?:\/\//i.test(src)) {
    return src;
  }

  const cid =
    blobCid(attrs.blob) ?? (typeof src === "string" ? cidFromSrc(src) : null);
  if (!cid) return null;
  return cdnImageUrl(did, cid, "png");
}

/** Width ÷ height for layout; falls back to 16∶9 when missing or invalid. */
export function pcktImageAspectRatio(block: PcktImageBlock): number {
  const ratio = block.attrs?.aspectRatio;
  const width = ratio?.width;
  const height = ratio?.height;
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

export function pcktImageAlign(
  block: PcktImageBlock,
): "left" | "center" | "right" | undefined {
  const align = block.attrs?.align;
  if (align === "left" || align === "center" || align === "right") {
    return align;
  }
  return undefined;
}

export function pcktImageAlt(block: PcktImageBlock): string {
  return normalizeImageAlt(block.attrs?.alt, block.attrs?.title);
}

/** True when attrs contain enough data to attempt rendering. */
export function pcktImageHasSource(block: PcktImageBlock): boolean {
  const attrs = block.attrs;
  if (!isRecord(attrs)) return false;
  return typeof attrs.src === "string" || attrs.blob != null;
}
