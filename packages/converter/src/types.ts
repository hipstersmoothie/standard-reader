/**
 * The public vocabulary of a conversion: what you can convert to, what a
 * conversion produced, and everything it cost along the way.
 */

import type { BlockNode } from "@standard-reader/renderer-core";

/** The four content formats a document can be converted into. */
export const CONVERSION_TARGETS = [
  "leaflet",
  "offprint",
  "pckt",
  "markpub",
] as const;

export type ConversionTarget = (typeof CONVERSION_TARGETS)[number];

/** The content-union `$type` each target writes into a document record. */
export const TARGET_CONTENT_TYPE: Record<ConversionTarget, string> = {
  leaflet: "pub.leaflet.content",
  markpub: "at.markpub.markdown",
  offprint: "app.offprint.content",
  pckt: "blog.pckt.content",
};

/** Human-readable platform names, for CLI output and docs. */
export const TARGET_LABEL: Record<ConversionTarget, string> = {
  leaflet: "Leaflet",
  markpub: "Markpub",
  offprint: "Offprint",
  pckt: "pckt",
};

export function isConversionTarget(
  value: string | null | undefined,
): value is ConversionTarget {
  return CONVERSION_TARGETS.includes(value as ConversionTarget);
}

/**
 * The target a content `$type` already belongs to, or null when the format is
 * something else (markdown-in-record, ProseMirror, Gutenberg, …). Used to skip
 * documents that are already in the requested format.
 */
export function targetForContentType(
  format: string | null | undefined,
): ConversionTarget | null {
  if (!format) return null;
  for (const target of CONVERSION_TARGETS) {
    if (TARGET_CONTENT_TYPE[target] === format) return target;
  }
  // `at.markpub.text` is a bare Markpub body — the same target, different shape.
  if (format === "at.markpub.text") return "markpub";
  return null;
}

/**
 * How badly a block fares in the target format.
 *
 * - `lossy` — the content survives, but something about it does not: a
 *   callout becomes a plain blockquote, a caption is dropped, nesting is
 *   flattened. Readers still see the words.
 * - `unsupported` — the target has no way to carry this block at all, so it is
 *   omitted from the output. This is the severity that should make a CLI stop
 *   and ask before overwriting a record.
 */
export type IssueSeverity = "lossy" | "unsupported";

export interface ConversionIssue {
  severity: IssueSeverity;
  /** Stable machine-readable code, e.g. `block-unsupported`, `facet-dropped`. */
  code: string;
  /** Index into the source document's blocks, or null for document-wide issues. */
  blockIndex: number | null;
  /** The normalized block type the issue is about (`table`, `callout`, …). */
  blockType: string;
  /** One-line explanation, written for the person about to lose the content. */
  message: string;
  /** What the converter emitted instead, when it emitted anything. */
  fallback?: string;
}

export interface ConversionResult {
  target: ConversionTarget;
  /** The `$type` written into the record's `content`. */
  contentType: string;
  /** The source content's resolved `$type`. */
  sourceFormat: string | null;
  /** The converted content payload, or null when conversion was not possible. */
  content: Record<string, unknown> | null;
  issues: Array<ConversionIssue>;
  /** Blocks in the parsed source document. */
  blockCount: number;
  /** True when the source is already in the target format — nothing to do. */
  unchanged: boolean;
  /** True when no block or inline detail was dropped (no `unsupported` issues). */
  lossless: boolean;
}

export interface ConvertOptions {
  /** The raw `content` union payload of a `site.standard.document` record. */
  content: unknown;
  /** Explicit content `$type`, when `content.$type` is absent. */
  contentFormat?: string | null;
  /** DID of the repo hosting the document's image blobs. */
  authorDid?: string;
  target: ConversionTarget;
}

/** Every block type the normalized render tree can produce. */
export type BlockType = BlockNode["type"];

/** Collects issues as an emitter walks the document. */
export interface Reporter {
  readonly issues: Array<ConversionIssue>;
  report: (issue: ConversionIssue) => void;
}

export function createReporter(): Reporter {
  const issues: Array<ConversionIssue> = [];
  return {
    issues,
    report: (issue) => {
      issues.push(issue);
    },
  };
}
