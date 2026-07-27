/**
 * The gate every emitter walks each block through.
 *
 * `admit` consults the capability matrix, files the resulting warning, and
 * tells the emitter whether to write anything at all. Keeping the decision here
 * — rather than in each target's switch — is what stops a converter from
 * quietly emitting a block it just warned was unsupported, or dropping one it
 * never warned about.
 */

import type {
  BlockNode,
  CollectionImage,
} from "@standard-reader/renderer-core";

import { blockSupport } from "./capabilities.js";
import type { ConversionTarget, Reporter } from "./types.js";

export interface EmitContext {
  target: ConversionTarget;
  report: Reporter["report"];
  /** DID of the repo hosting the document's blobs, when known. */
  authorDid?: string;
}

/**
 * Whether the target can carry this block, filing the matrix's warning as a
 * side effect. `false` means the emitter must skip it: the reader has already
 * been told it is being dropped.
 */
export function admit(
  ctx: EmitContext,
  node: BlockNode,
  blockIndex: number | null,
): boolean {
  const support = blockSupport(ctx.target, node.type);
  if (support.level === "native") return true;

  if (support.level === "none") {
    ctx.report({
      blockIndex,
      blockType: node.type,
      code: "block-unsupported",
      message: support.note,
      severity: "unsupported",
    });
    return false;
  }

  ctx.report({
    blockIndex,
    blockType: node.type,
    code: "block-degraded",
    message: support.note,
    severity: "lossy",
    fallback: support.fallback,
  });
  return true;
}

/** File a warning about a detail the target has no field for. */
export function noteDropped(
  ctx: EmitContext,
  node: BlockNode,
  blockIndex: number | null,
  message: string,
  fallback?: string,
): void {
  ctx.report({
    blockIndex,
    blockType: node.type,
    code: "detail-dropped",
    message,
    severity: "lossy",
    ...(fallback === undefined ? {} : { fallback }),
  });
}

/**
 * A Bluesky embed needs a strongRef (`uri` + `cid`) in every block-based
 * format. When the source only carried the URI there is nothing to reconstruct,
 * and a PDS that validates the lexicon will reject the write — so say so
 * plainly rather than emitting a record that fails on `putRecord`.
 */
export function noteMissingPostCid(
  ctx: EmitContext,
  node: BlockNode,
  blockIndex: number | null,
): void {
  ctx.report({
    blockIndex,
    blockType: node.type,
    code: "strongref-incomplete",
    message:
      "The source recorded the embedded post's URI but not its CID, which " +
      "this format requires; a PDS that validates the lexicon may reject the record",
    severity: "lossy",
    fallback: "a reference carrying only the post URI",
  });
}

/** The blob ref behind an image, when it has one. */
export function imageBlob(image: {
  source?: { blob?: unknown };
}): unknown | undefined {
  return image.source?.blob ?? undefined;
}

/**
 * The `{width, height}` an image block should re-emit.
 *
 * Prefers the dimensions the source record carried; falls back to the derived
 * ratio scaled to whole numbers, which preserves the ratio even though it is
 * no longer the image's pixel size.
 */
export function aspectRatio(image: {
  aspectRatio?: number;
  source?: { aspectRatio?: { width?: number; height?: number } };
}): { width: number; height: number } | undefined {
  const raw = image.source?.aspectRatio;
  if (raw?.width != null && raw.height != null) {
    return { height: raw.height, width: raw.width };
  }
  const ratio = image.aspectRatio;
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return undefined;
  return { height: 1000, width: Math.round(ratio * 1000) };
}

/** True when an image still has a source we can point the target at. */
export function hasImageSource(image: CollectionImage): boolean {
  return image.source?.blob != null || Boolean(image.source?.externalSrc);
}
