import { isRecord } from "../internal.js";
import { LEAFLET_CONTENT } from "../leaflet/types.js";
import {
  BLOCKNOTE_CONTENT,
  blocknoteBlocks,
} from "./structured-content/blocknote.js";
import { FABLES_CONTENT, fablesBlocks } from "./structured-content/fables.js";
import {
  GUTENBERG_CONTENT,
  gutenbergBlocks,
} from "./structured-content/gutenberg.js";
import {
  ITEM_BLOCK_FORMATS,
  itemBlocks,
} from "./structured-content/item-blocks.js";
import type { MarkdownDocument } from "./structured-content/markdown.js";
import {
  MARKDOWN_FORMATS,
  markdownBlocks,
  markdownDocumentFromText,
  markdownText,
} from "./structured-content/markdown.js";
import {
  MARKPUB_FORMATS,
  markpubBlocks,
  markpubDocument,
} from "./structured-content/markpub.js";
import { OXA_CONTENT, oxaBlocks } from "./structured-content/oxa.js";
import {
  PROSEMIRROR_CONTENT,
  prosemirrorBlocks,
} from "./structured-content/prosemirror.js";
import type { StructuredRenderableBlock } from "./structured-content/types.js";

/** `pub.leaflet.document` — a full Leaflet document whose `pages` match the
 *  `pub.leaflet.content` shape. */
export const LEAFLET_DOCUMENT_FORMAT = "pub.leaflet.document";

/**
 * `pub.leaflet.document` blocks carry their text under `text`, while the
 * `pub.leaflet.content` parser expects `plaintext` — mirror it across.
 */
function normalizeLeafletDocumentBlock(entry: unknown): unknown {
  if (!isRecord(entry)) return entry;
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
 * `pub.leaflet.content`) so the leaflet block parser accepts it.
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
) => Array<StructuredRenderableBlock> | null;

const STRUCTURED_FORMAT_PARSERS: Record<string, BlockParser> = {
  [BLOCKNOTE_CONTENT]: blocknoteBlocks,
  [FABLES_CONTENT]: fablesBlocks,
  [GUTENBERG_CONTENT]: gutenbergBlocks,
  [OXA_CONTENT]: oxaBlocks,
  [PROSEMIRROR_CONTENT]: prosemirrorBlocks,
};
for (const format of ITEM_BLOCK_FORMATS) {
  STRUCTURED_FORMAT_PARSERS[format] = itemBlocks;
}
for (const format of MARKDOWN_FORMATS) {
  STRUCTURED_FORMAT_PARSERS[format] = markdownBlocks;
}
for (const format of MARKPUB_FORMATS) {
  STRUCTURED_FORMAT_PARSERS[format] = markpubBlocks;
}

/** Every third-party block-based content format the structured parser knows. */
export const STRUCTURED_BLOCK_FORMATS = Object.keys(STRUCTURED_FORMAT_PARSERS);

export function isStructuredBlockFormat(format: string | null | undefined) {
  return Boolean(format && format in STRUCTURED_FORMAT_PARSERS);
}

/**
 * Renderable blocks for any supported block-based third-party format, or null
 * when `format` isn't one of them.
 */
/**
 * Blocks *and* footnotes for a supported format.
 *
 * Only the markdown-derived formats produce footnotes; everything else returns
 * an empty list, so callers have one shape to handle. `structuredFormatBlocks`
 * stays for consumers that only want blocks.
 */
export function structuredFormatDocument(
  content: unknown,
  contentFormat?: string | null,
): MarkdownDocument | null {
  const format =
    isRecord(content) && typeof content.$type === "string"
      ? content.$type
      : contentFormat;
  if (!format) return null;

  if (MARKPUB_FORMATS.includes(format)) {
    return markpubDocument(content, format);
  }
  if (MARKDOWN_FORMATS.includes(format)) {
    const text = markdownText(content, format);
    return text ? markdownDocumentFromText(text) : null;
  }
  const blocks = structuredFormatBlocks(content, format);
  return blocks ? { blocks, footnotes: [] } : null;
}

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
