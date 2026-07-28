import {
  GUTENBERG_CONTENT,
  isMarkdownFormat,
  isMarkpubFormat,
  STRUCTURED_BLOCK_FORMATS as RENDERER_CORE_BLOCK_FORMATS,
  structuredFormatBlocks as renderCoreStructuredBlocks,
} from "@standard-reader/renderer-core";

/**
 * Central dispatch for third-party document content formats beyond the four
 * first-class families (leaflet / pckt / offprint / standard markdown).
 *
 * Three categories, each consumed by rendering, search-text extraction, and
 * the renderable-body check:
 *  - markdown-in-record  → `altMarkdownText` (alt-markdown.ts)
 *  - HTML-in-record      → `htmlContentBody` / `htmlContentPlaintext` (html.ts)
 *  - block-based         → `structuredFormatBlocks` (parsed by `renderer-core`)
 *
 * The block parsers live in `@standard-reader/renderer-core` — the app used to
 * carry a second copy of each one, which is how its blocks ended up a version
 * behind (flat list items, no raw-HTML block, no image captions).
 *
 * `pub.leaflet.document` is special-cased: it's a full Leaflet document whose
 * `pages` match `pub.leaflet.content`, so it adapts onto the existing leaflet
 * pipeline via `leafletDocumentContent`.
 */
import type { StructuredRenderableBlock } from "./structured-content/types";

export {
  ALT_MARKDOWN_FORMATS,
  altMarkdownText,
  isAltMarkdownFormat,
} from "./structured-content/alt-markdown";
export {
  markpubPlaintext,
  prepareMarkpubMarkdown,
} from "#/lib/markpub/markdown";
export { isMarkpubFormat, parseMarkpubContent } from "#/lib/markpub/parse";
export { MARKPUB_MARKDOWN } from "#/lib/markpub/types";
export {
  HTML_CONTENT_FORMATS,
  htmlContentBody,
  htmlContentPlaintext,
  isHtmlContentFormat,
} from "./structured-content/html";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `pub.leaflet.document` — the full-document twin of `pub.leaflet.content`,
 * adapted onto the leaflet block parser by `leafletDocumentContent` (both owned
 * by `renderer-core`).
 */
export {
  LEAFLET_DOCUMENT_FORMAT,
  leafletDocumentContent,
} from "@standard-reader/renderer-core";

/**
 * The block-based formats *this app* routes through the structured path:
 * everything `renderer-core` parses to blocks, minus the formats the app
 * already has a more specific route for — the markdown-bodied ones (rendered by
 * `renderer-react` via the markdown renderer, plaintext via `altMarkdownText` /
 * `markpubPlaintext`) and SkyPress Gutenberg (serialized to HTML by
 * `html.ts`). Core can parse those too; the app just doesn't ask it to.
 */
const STRUCTURED_FORMAT_SET = new Set(
  RENDERER_CORE_BLOCK_FORMATS.filter(
    (format) =>
      !isMarkdownFormat(format) &&
      !isMarkpubFormat(format) &&
      format !== GUTENBERG_CONTENT,
  ),
);

export const STRUCTURED_BLOCK_FORMATS = [...STRUCTURED_FORMAT_SET];

export function isStructuredBlockFormat(format: string | null | undefined) {
  return Boolean(format && STRUCTURED_FORMAT_SET.has(format));
}

/**
 * Renderable blocks for any supported block-based third-party format, or null
 * when `format` isn't one of them.
 */
export function structuredFormatBlocks(
  content: unknown,
  contentFormat?: string | null,
): Array<StructuredRenderableBlock> | null {
  const format =
    isRecord(content) && typeof content.$type === "string"
      ? content.$type
      : contentFormat;
  if (!format || !STRUCTURED_FORMAT_SET.has(format)) return null;
  return renderCoreStructuredBlocks(content, format);
}
