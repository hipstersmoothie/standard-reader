import type { PcktImageBlock } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function blobCid(blob: unknown): string | null {
  if (!isRecord(blob)) return null;
  const ref = blob.ref;
  if (typeof ref === "string") return ref;
  if (isRecord(ref) && typeof ref.$link === "string") return ref.$link;
  return null;
}

/** Pull a CID from `blob:CID` src strings or blob refs. */
function cidFromSrc(src: string): string | null {
  if (src.startsWith("blob:")) return src.slice("blob:".length) || null;
  return null;
}

function getBlobUrl(pds: string, did: string, cid: string): string {
  const base = pds.replace(/\/+$/, "");
  return `${base}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(
    did,
  )}&cid=${encodeURIComponent(cid)}`;
}

/** Build a blob URL or return an external `https:` src. */
export function pcktImageUrl(
  block: PcktImageBlock,
  did: string,
  pds: string | null | undefined,
): string | null {
  const attrs = block.attrs;
  if (!attrs) return null;

  const src = attrs.src;
  if (typeof src === "string" && /^https?:\/\//i.test(src)) {
    return src;
  }

  const cid =
    blobCid(attrs.blob) ?? (typeof src === "string" ? cidFromSrc(src) : null);
  if (!cid || !pds) return null;
  return getBlobUrl(pds, did, cid);
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
  return block.attrs?.alt?.trim() ?? block.attrs?.title?.trim() ?? "";
}

/** True when attrs contain enough data to attempt rendering. */
export function pcktImageHasSource(block: PcktImageBlock): boolean {
  const attrs = block.attrs;
  if (!isRecord(attrs)) return false;
  return typeof attrs.src === "string" || attrs.blob != null;
}
