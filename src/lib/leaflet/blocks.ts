import type {
  LeafletBlockquoteBlock,
  LeafletBskyPostBlock,
  LeafletButtonBlock,
  LeafletCodeBlock,
  LeafletContent,
  LeafletHeaderBlock,
  LeafletIframeBlock,
  LeafletImageBlock,
  LeafletMathBlock,
  LeafletOrderedListBlock,
  LeafletPollBlock,
  LeafletRenderableBlock,
  LeafletStandardSitePostBlock,
  LeafletTextBlock,
  LeafletUnorderedListBlock,
  LeafletWebsiteBlock,
} from "./types";

import { LEAFLET_BLOCK, LEAFLET_CONTENT, LEAFLET_PAGE } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapPageBlock(entry: unknown): Record<string, unknown> | null {
  if (!isRecord(entry)) return null;
  if (
    entry.$type === LEAFLET_PAGE.linearDocumentBlock ||
    entry.$type === LEAFLET_PAGE.canvasBlock
  ) {
    const inner = entry.block;
    return isRecord(inner) ? inner : null;
  }
  // Skyreader linkblogs nest blocks under `block` without the page wrapper $type.
  const nested = entry.block;
  if (isRecord(nested) && typeof nested.$type === "string") {
    return nested;
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

function asOrderedListBlock(value: unknown): LeafletOrderedListBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== LEAFLET_BLOCK.orderedList) return null;
  return value as unknown as LeafletOrderedListBlock;
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

  const unorderedList = asUnorderedListBlock(value);
  if (unorderedList) return { kind: "unorderedList", block: unorderedList };

  const orderedList = asOrderedListBlock(value);
  if (orderedList) return { kind: "orderedList", block: orderedList };

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

  if (value.$type === LEAFLET_BLOCK.website) {
    const url = typeof value.url === "string" ? value.url : null;
    if (!url) return null;
    return {
      kind: "website",
      block: value as unknown as LeafletWebsiteBlock,
    };
  }

  if (value.$type === LEAFLET_BLOCK.math) {
    const tex = typeof value.tex === "string" ? value.tex : null;
    if (!tex) return null;
    return {
      kind: "math",
      block: value as unknown as LeafletMathBlock,
    };
  }

  if (value.$type === LEAFLET_BLOCK.button) {
    const url = typeof value.url === "string" ? value.url : null;
    if (!url) return null;
    return {
      kind: "button",
      block: value as unknown as LeafletButtonBlock,
    };
  }

  if (value.$type === LEAFLET_BLOCK.poll) {
    const pollUri = isRecord(value.pollRef) ? value.pollRef.uri : null;
    if (typeof pollUri !== "string" || pollUri.length === 0) return null;
    return {
      kind: "poll",
      block: value as unknown as LeafletPollBlock,
    };
  }

  if (value.$type === LEAFLET_BLOCK.standardSitePost) {
    const uri = typeof value.uri === "string" ? value.uri : null;
    if (!uri) return null;
    return {
      kind: "standardSitePost",
      block: value as unknown as LeafletStandardSitePostBlock,
    };
  }

  if (value.$type === LEAFLET_BLOCK.separator) {
    return { kind: "separator" };
  }

  if (value.$type === LEAFLET_BLOCK.horizontalRule) {
    return { kind: "horizontalRule" };
  }

  const blockType =
    typeof value.$type === "string" ? value.$type : "unknown block";
  return { kind: "unknown", blockType };
}

function collectReferencedPageIds(page: unknown): Array<string> {
  if (!isRecord(page)) return [];
  const blocks = page.blocks;
  if (!Array.isArray(blocks)) return [];

  const ids: Array<string> = [];
  for (const entry of blocks) {
    const inner = unwrapPageBlock(entry);
    if (inner?.$type === LEAFLET_BLOCK.page && typeof inner.id === "string") {
      ids.push(inner.id);
    }
  }
  return ids;
}

function resolvePageBlocks(
  page: unknown,
  pagesById: Map<string, unknown>,
  visiting: Set<string>,
): Array<LeafletRenderableBlock> {
  if (!isRecord(page)) return [];
  const blocks = page.blocks;
  if (!Array.isArray(blocks)) return [];

  const result: Array<LeafletRenderableBlock> = [];
  for (const entry of blocks) {
    const inner = unwrapPageBlock(entry);
    if (!inner) continue;

    if (inner.$type === LEAFLET_BLOCK.page) {
      const pageId = typeof inner.id === "string" ? inner.id : null;
      if (!pageId || visiting.has(pageId)) continue;
      const referenced = pagesById.get(pageId);
      if (!referenced) continue;
      visiting.add(pageId);
      result.push(...resolvePageBlocks(referenced, pagesById, visiting));
      visiting.delete(pageId);
      continue;
    }

    const parsed = asRenderableBlock(inner);
    if (parsed) result.push(parsed);
  }
  return result;
}

function blocksFromCanvasPage(page: unknown): Array<LeafletRenderableBlock> {
  if (!isRecord(page)) return [];
  const blocks = page.blocks;
  if (!Array.isArray(blocks)) return [];

  const sorted = blocks.toSorted((left, right) => {
    const leftY = isRecord(left) && typeof left.y === "number" ? left.y : 0;
    const rightY = isRecord(right) && typeof right.y === "number" ? right.y : 0;
    if (leftY !== rightY) return leftY - rightY;
    const leftX = isRecord(left) && typeof left.x === "number" ? left.x : 0;
    const rightX = isRecord(right) && typeof right.x === "number" ? right.x : 0;
    return leftX - rightX;
  });

  const result: Array<LeafletRenderableBlock> = [];
  for (const entry of sorted) {
    const inner = unwrapPageBlock(entry);
    if (!inner) continue;
    const parsed = asRenderableBlock(inner);
    if (parsed) result.push(parsed);
  }
  return result;
}

function blocksFromPage(
  page: unknown,
  pagesById: Map<string, unknown>,
): Array<LeafletRenderableBlock> {
  if (!isRecord(page)) return [];
  if (page.$type === LEAFLET_PAGE.canvas) {
    return blocksFromCanvasPage(page);
  }
  return resolvePageBlocks(page, pagesById, new Set());
}

/** Every renderable block in document order. */
export function leafletBlocks(content: unknown): Array<LeafletRenderableBlock> {
  if (!isRecord(content)) return [];
  if (content.$type !== LEAFLET_CONTENT) return [];
  const pages = content.pages;
  if (!Array.isArray(pages)) return [];

  const pagesById = new Map<string, unknown>();
  const referencedIds = new Set<string>();

  for (const page of pages) {
    if (!isRecord(page) || typeof page.id !== "string") continue;
    pagesById.set(page.id, page);
    for (const pageId of collectReferencedPageIds(page)) {
      referencedIds.add(pageId);
    }
  }

  const rootPages = pages.filter(
    (page) =>
      isRecord(page) &&
      typeof page.id === "string" &&
      !referencedIds.has(page.id),
  );
  const pagesToRender = rootPages.length > 0 ? rootPages : pages;

  return pagesToRender.flatMap((page) => blocksFromPage(page, pagesById));
}

/** AT-URIs of every embedded Bluesky post block, in document order. */
export function leafletBskyPostUris(content: unknown): Array<string> {
  return leafletBlocks(content)
    .map((block) =>
      block.kind === "bskyPost" ? block.block.postRef?.uri : undefined,
    )
    .filter((uri): uri is string => typeof uri === "string" && uri.length > 0);
}

/**
 * Plaintext lines contributed by a single leaflet block (for reading-time
 * ingest). `bskyPostText` optionally supplies narration text for embedded
 * Bluesky posts (keyed by their AT-URI) so the page reader can speak them.
 */
export function plaintextLinesFromBlock(
  block: LeafletRenderableBlock,
  bskyPostText?: Map<string, string>,
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
    case "unorderedList":
    case "orderedList": {
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
    case "bskyPost": {
      const uri = block.block.postRef?.uri;
      const text = uri ? bskyPostText?.get(uri) : undefined;
      return text ? [text] : [];
    }
    case "website": {
      const title = block.block.title?.trim();
      const description = block.block.description?.trim();
      const lines: Array<string> = [];
      if (title) lines.push(title);
      if (description) lines.push(description);
      return lines;
    }
    case "math": {
      const tex = block.block.tex?.trim();
      return tex ? [tex] : [];
    }
    case "button": {
      const label = block.block.text?.trim();
      return label ? [label] : [];
    }
    case "standardSitePost": {
      return [];
    }
    case "horizontalRule":
    case "separator":
    case "poll":
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
