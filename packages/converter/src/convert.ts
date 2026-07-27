/**
 * The conversion entry point.
 *
 * Every source format already has a parser in `@standard-reader/renderer-core`
 * that normalizes it into one `DocumentTree`, so conversion is that same parse
 * followed by a re-emit into the target's vocabulary. Nothing here is
 * format-to-format: adding a fifth source format to renderer-core makes it
 * convertible here for free.
 */

import { buildRenderTree } from "@standard-reader/renderer-core";

import { FOOTNOTE_SUPPORT } from "./capabilities.js";
import type { EmitContext } from "./emit.js";
import { isRecord } from "./internal.js";
import { toLeaflet } from "./targets/leaflet.js";
import { toMarkpub } from "./targets/markpub.js";
import { toOffprint } from "./targets/offprint.js";
import { toPckt } from "./targets/pckt.js";
import type {
  ConversionResult,
  ConversionTarget,
  ConvertOptions,
} from "./types.js";
import {
  createReporter,
  TARGET_CONTENT_TYPE,
  targetForContentType,
} from "./types.js";

const EMITTERS = {
  leaflet: toLeaflet,
  markpub: toMarkpub,
  offprint: toOffprint,
  pckt: toPckt,
} as const;

function sourceFormat(options: ConvertOptions): string | null {
  if (isRecord(options.content) && typeof options.content.$type === "string") {
    return options.content.$type;
  }
  return options.contentFormat ?? null;
}

function emptyResult(
  target: ConversionTarget,
  format: string | null,
  overrides: Partial<ConversionResult>,
): ConversionResult {
  return {
    blockCount: 0,
    content: null,
    contentType: TARGET_CONTENT_TYPE[target],
    issues: [],
    lossless: false,
    sourceFormat: format,
    target,
    unchanged: false,
    ...overrides,
  };
}

/**
 * Convert a document record's `content` payload into another format.
 *
 * The result always carries the full issue list, whether or not the conversion
 * produced output — a caller can render the warnings and decide whether to
 * write the record, which is the whole point of reporting them per block.
 */
export function convertDocumentContent(
  options: ConvertOptions,
): ConversionResult {
  const { target } = options;
  const format = sourceFormat(options);

  if (targetForContentType(format) === target) {
    return emptyResult(target, format, {
      content: isRecord(options.content) ? options.content : null,
      unchanged: true,
      lossless: true,
    });
  }

  const tree = buildRenderTree({
    authorDid: options.authorDid,
    content: options.content,
    contentFormat: options.contentFormat,
  });

  if (!tree) {
    return emptyResult(target, format, {
      issues: [
        {
          blockIndex: null,
          blockType: "document",
          code: "source-unreadable",
          message: format
            ? `no parser understands the content format ${format}, or it has no body to convert`
            : "the record carries no recognizable content format",
          severity: "unsupported",
        },
      ],
    });
  }

  const reporter = createReporter();
  const base: EmitContext = {
    report: reporter.report,
    target,
    ...(options.authorDid === undefined
      ? {}
      : { authorDid: options.authorDid }),
  };

  // Leaflet footnotes ride on the facets, so a target without a footnote
  // feature loses the note bodies entirely, not just the reference marks.
  if (tree.footnotes.length > 0 && FOOTNOTE_SUPPORT[target] === "none") {
    reporter.report({
      blockIndex: null,
      blockType: "document",
      code: "footnotes-unsupported",
      message: `${tree.footnotes.length} footnote${tree.footnotes.length === 1 ? "" : "s"} cannot be carried into ${target}, which has no footnote feature`,
      severity: "unsupported",
    });
  } else if (
    tree.footnotes.length > 0 &&
    FOOTNOTE_SUPPORT[target] === "degraded"
  ) {
    reporter.report({
      blockIndex: null,
      blockType: "document",
      code: "footnotes-degraded",
      message:
        "footnotes become GFM footnote syntax, which Markpub's own reader " +
        "renders as literal text rather than as notes",
      severity: "lossy",
      fallback: "[^n] references with definitions at the end of the body",
    });
  }

  const content = EMITTERS[target](tree, base);

  if (!content) {
    reporter.report({
      blockIndex: null,
      blockType: "document",
      code: "empty-result",
      message: `nothing in this document survives conversion to ${target}`,
      severity: "unsupported",
    });
  }

  return {
    blockCount: tree.children.length,
    content,
    contentType: TARGET_CONTENT_TYPE[target],
    issues: reporter.issues,
    lossless:
      content != null &&
      !reporter.issues.some((issue) => issue.severity === "unsupported"),
    sourceFormat: format,
    target,
    unchanged: false,
  };
}
