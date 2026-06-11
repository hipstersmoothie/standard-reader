/**
 * Central dispatch for third-party document content formats beyond the four
 * first-class families (leaflet / pckt / offprint / standard markdown).
 *
 * Three categories, each consumed by rendering, search-text extraction, and
 * the renderable-body check:
 *  - markdown-in-record  → `altMarkdownText` (alt-markdown.ts)
 *  - HTML-in-record      → `htmlContentBody` / `htmlContentPlaintext` (html.ts)
 *  - block-based         → `structuredFormatBlocks` (parsers below)
 *
 * `pub.leaflet.document` is special-cased: it's a full Leaflet document whose
 * `pages` match `pub.leaflet.content`, so it adapts onto the existing leaflet
 * pipeline via `leafletDocumentContent`.
 */
import type { StructuredRenderableBlock } from "./structured-content/types";

import { LEAFLET_CONTENT } from "../leaflet/types";
import {
  BLOCKNOTE_CONTENT,
  blocknoteBlocks,
} from "./structured-content/blocknote";
import { FABLES_CONTENT, fablesBlocks } from "./structured-content/fables";
import {
  ITEM_BLOCK_FORMATS,
  itemBlocks,
} from "./structured-content/item-blocks";
import { OXA_CONTENT, oxaBlocks } from "./structured-content/oxa";
import {
  PROSEMIRROR_CONTENT,
  prosemirrorBlocks,
} from "./structured-content/prosemirror";

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

export const LEAFLET_DOCUMENT_FORMAT = "pub.leaflet.document";

/**
 * `pub.leaflet.document` blocks carry their text under `text`, while the
 * `pub.leaflet.content` parser expects `plaintext` — mirror it across.
 */
function normalizeLeafletDocumentBlock(entry: unknown): unknown {
  if (!isRecord(entry)) return entry;
  // Page-wrapper entries nest the actual block under `block`.
  if (isRecord(entry.block)) {
    return { ...entry, block: normalizeLeafletDocumentBlock(entry.block) };
  }
  if (typeof entry.text === "string" && entry.plaintext === undefined) {
    return { ...entry, plaintext: entry.text };
  }
  return entry;
}

/**
 * Adapt a `pub.leaflet.document` payload (same `pages` shape as
 * `pub.leaflet.content`) so the leaflet block parser/renderer accept it.
 */
export function leafletDocumentContent(content: unknown): unknown {
  if (!isRecord(content)) return null;
  if (content.$type !== LEAFLET_DOCUMENT_FORMAT) return null;
  const pages = Array.isArray(content.pages)
    ? content.pages.map((page) => {
        if (!isRecord(page) || !Array.isArray(page.blocks)) return page;
        return {
          ...page,
          blocks: page.blocks.map((entry) =>
            normalizeLeafletDocumentBlock(entry),
          ),
        };
      })
    : content.pages;
  return { ...content, $type: LEAFLET_CONTENT, pages };
}

type BlockParser = (
  content: unknown,
  contentFormat?: string | null,
) => Array<StructuredRenderableBlock>;

const STRUCTURED_FORMAT_PARSERS: Record<string, BlockParser> = {
  [BLOCKNOTE_CONTENT]: blocknoteBlocks,
  [FABLES_CONTENT]: fablesBlocks,
  [OXA_CONTENT]: oxaBlocks,
  [PROSEMIRROR_CONTENT]: prosemirrorBlocks,
};
for (const format of ITEM_BLOCK_FORMATS) {
  STRUCTURED_FORMAT_PARSERS[format] = itemBlocks;
}

export const STRUCTURED_BLOCK_FORMATS = Object.keys(STRUCTURED_FORMAT_PARSERS);

export function isStructuredBlockFormat(format: string | null | undefined) {
  return Boolean(format && format in STRUCTURED_FORMAT_PARSERS);
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
  if (!format) return null;
  const parse = STRUCTURED_FORMAT_PARSERS[format];
  if (!parse) return null;
  return parse(content, format);
}
