import type {
  LeafletBlockquoteBlock,
  LeafletBskyPostBlock,
  LeafletCodeBlock,
  LeafletContent,
  LeafletHeaderBlock,
  LeafletIframeBlock,
  LeafletImageBlock,
  LeafletRenderableBlock,
  LeafletTextBlock,
  LeafletUnorderedListBlock,
} from "./types";

import { LEAFLET_BLOCK, LEAFLET_CONTENT, LEAFLET_PAGE } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapPageBlock(entry: unknown): Record<string, unknown> | null {
  if (!isRecord(entry)) return null;
  if (entry.$type === LEAFLET_PAGE.linearDocumentBlock) {
    const inner = entry.block;
    return isRecord(inner) ? inner : null;
  }
  return entry;
}

export function asTextBlock(value: unknown): LeafletTextBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== LEAFLET_BLOCK.text) return null;
  if (typeof value.plaintext !== "string") return null;
  return value as unknown as LeafletTextBlock;
}

function asHeaderBlock(value: unknown): LeafletHeaderBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== LEAFLET_BLOCK.header) return null;
  if (typeof value.plaintext !== "string") return null;
  return value as unknown as LeafletHeaderBlock;
}

function asBlockquoteBlock(value: unknown): LeafletBlockquoteBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== LEAFLET_BLOCK.blockquote) return null;
  if (typeof value.plaintext !== "string") return null;
  return value as unknown as LeafletBlockquoteBlock;
}

function asUnorderedListBlock(
  value: unknown,
): LeafletUnorderedListBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== LEAFLET_BLOCK.unorderedList) return null;
  return value as unknown as LeafletUnorderedListBlock;
}

function asCodeBlock(value: unknown): LeafletCodeBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== LEAFLET_BLOCK.code) return null;
  if (typeof value.plaintext !== "string") return null;
  return value as unknown as LeafletCodeBlock;
}

function asIframeBlock(value: unknown): LeafletIframeBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== LEAFLET_BLOCK.iframe) return null;
  return value as unknown as LeafletIframeBlock;
}

function asRenderableBlock(value: unknown): LeafletRenderableBlock | null {
  if (!isRecord(value)) return null;

  const text = asTextBlock(value);
  if (text) return { kind: "text", block: text };

  const header = asHeaderBlock(value);
  if (header) return { kind: "header", block: header };

  const blockquote = asBlockquoteBlock(value);
  if (blockquote) return { kind: "blockquote", block: blockquote };

  const list = asUnorderedListBlock(value);
  if (list) return { kind: "unorderedList", block: list };

  if (value.$type === LEAFLET_BLOCK.bskyPost) {
    return {
      kind: "bskyPost",
      block: value as unknown as LeafletBskyPostBlock,
    };
  }

  if (value.$type === LEAFLET_BLOCK.image) {
    return {
      kind: "image",
      block: value as unknown as LeafletImageBlock,
    };
  }

  const code = asCodeBlock(value);
  if (code) return { kind: "code", block: code };

  const iframe = asIframeBlock(value);
  if (iframe) return { kind: "iframe", block: iframe };

  if (value.$type === LEAFLET_BLOCK.horizontalRule) {
    return { kind: "horizontalRule" };
  }

  const blockType =
    typeof value.$type === "string" ? value.$type : "unknown block";
  return { kind: "unknown", blockType };
}

function blocksFromPage(page: unknown): Array<LeafletRenderableBlock> {
  if (!isRecord(page)) return [];
  const blocks = page.blocks;
  if (!Array.isArray(blocks)) return [];

  const result: Array<LeafletRenderableBlock> = [];
  for (const entry of blocks) {
    const inner = unwrapPageBlock(entry);
    if (!inner) continue;
    const parsed = asRenderableBlock(inner);
    if (parsed) result.push(parsed);
  }
  return result;
}

/** Every renderable block in document order. */
export function leafletBlocks(content: unknown): Array<LeafletRenderableBlock> {
  if (!isRecord(content)) return [];
  if (content.$type !== LEAFLET_CONTENT) return [];
  const pages = content.pages;
  if (!Array.isArray(pages)) return [];
  return pages.flatMap((page) => blocksFromPage(page));
}

/** Plaintext lines contributed by a single leaflet block (for reading-time ingest). */
export function plaintextLinesFromBlock(
  block: LeafletRenderableBlock,
): Array<string> {
  switch (block.kind) {
    case "text": {
      const text = block.block.plaintext.trim();
      return text ? [text] : [];
    }
    case "header": {
      const text = block.block.plaintext.trim();
      return text ? [text] : [];
    }
    case "blockquote": {
      const text = block.block.plaintext.trim();
      return text ? [text] : [];
    }
    case "unorderedList": {
      const children = block.block.children ?? [];
      const lines: Array<string> = [];
      for (const child of children) {
        const item = asTextBlock(child.content);
        if (item?.plaintext.trim()) lines.push(item.plaintext.trim());
      }
      return lines;
    }
    case "code": {
      const text = block.block.plaintext.trim();
      return text ? [text] : [];
    }
    case "horizontalRule":
    case "bskyPost":
    case "image":
    case "iframe":
    case "unknown": {
      return [];
    }
  }
}

export function asLeafletContent(content: unknown): LeafletContent | null {
  if (!isRecord(content)) return null;
  if (content.$type !== LEAFLET_CONTENT) return null;
  return content as LeafletContent;
}
