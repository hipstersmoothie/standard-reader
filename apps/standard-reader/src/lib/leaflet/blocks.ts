import { narrationImageLines } from "#/lib/document/structured-content/image";

import type {
  LeafletBlockquoteBlock,
  LeafletCanvasFrame,
  LeafletCanvasPlacement,
  LeafletBskyPostBlock,
  LeafletButtonBlock,
  LeafletCodeBlock,
  LeafletContent,
  LeafletDrawingBlock,
  LeafletHeaderBlock,
  LeafletHtmlBlock,
  LeafletIframeBlock,
  LeafletImageBlock,
  LeafletImageGalleryBlock,
  LeafletMathBlock,
  LeafletMembersOnlyDelimiterBlock,
  LeafletOrderedListBlock,
  LeafletPollBlock,
  LeafletRenderableBlock,
  LeafletStandardSitePostBlock,
  LeafletStandardSitePublicationBlock,
  LeafletTextBlock,
  LeafletUnorderedListBlock,
  LeafletWebsiteBlock,
} from "./types";
import { LEAFLET_BLOCK, LEAFLET_CONTENT, LEAFLET_PAGE } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Blocks Leaflet fills in at render time from data outside the record: the
 * post's own header (title, byline — the reader draws its own), the
 * publication's post list and recommendations, and reader questions and
 * replies. None carries content of its own, so there is nothing to show and
 * nothing to flag as unsupported.
 */
const LEAFLET_RENDER_TIME_BLOCKS = new Set<string>([
  LEAFLET_BLOCK.postHeader,
  LEAFLET_BLOCK.postsList,
  LEAFLET_BLOCK.recommendedPubs,
  LEAFLET_BLOCK.questions,
  LEAFLET_BLOCK.reply,
]);

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

function asWebsiteBlock(value: unknown): LeafletWebsiteBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== LEAFLET_BLOCK.website) return null;
  const src =
    typeof value.src === "string"
      ? value.src
      : typeof value.url === "string"
        ? value.url
        : null;
  if (!src) return null;
  return {
    ...(value as unknown as LeafletWebsiteBlock),
    src,
    url: src,
  };
}

/** Bookmark URL for a leaflet website block (`src` in current lexicon). */
export function leafletWebsiteSrc(block: LeafletWebsiteBlock): string {
  return (block.src ?? block.url ?? "").trim();
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

  if (value.$type === LEAFLET_BLOCK.html) {
    // An empty document has nothing to frame; drop it rather than let it fall
    // through to the unsupported-block placeholder.
    const html = typeof value.html === "string" ? value.html : null;
    if (!html?.trim()) return null;
    return {
      kind: "html",
      block: value as unknown as LeafletHtmlBlock,
    };
  }

  const iframe = asIframeBlock(value);
  if (iframe) return { kind: "iframe", block: iframe };

  const website = asWebsiteBlock(value);
  if (website) {
    return { kind: "website", block: website };
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

  if (value.$type === LEAFLET_BLOCK.standardSitePublication) {
    const uri = typeof value.uri === "string" ? value.uri : null;
    if (!uri) return null;
    return {
      kind: "standardSitePublication",
      block: value as unknown as LeafletStandardSitePublicationBlock,
    };
  }

  if (value.$type === LEAFLET_BLOCK.imageGallery) {
    return {
      kind: "imageGallery",
      block: value as unknown as LeafletImageGalleryBlock,
    };
  }

  if (value.$type === LEAFLET_BLOCK.signup) {
    return { kind: "signup" };
  }

  if (value.$type === LEAFLET_BLOCK.separator) {
    return { kind: "separator" };
  }

  if (value.$type === LEAFLET_BLOCK.horizontalRule) {
    return { kind: "horizontalRule" };
  }

  if (value.$type === LEAFLET_BLOCK.drawing) {
    const strokes = Array.isArray(value.strokes) ? value.strokes : [];
    const fills = Array.isArray(value.fills) ? value.fills : [];
    if (strokes.length === 0 && fills.length === 0) return null;
    return {
      kind: "drawing",
      block: value as unknown as LeafletDrawingBlock,
    };
  }

  if (value.$type === LEAFLET_BLOCK.membersOnlyDelimiter) {
    return {
      kind: "membersOnlyDelimiter",
      block: value as unknown as LeafletMembersOnlyDelimiterBlock,
    };
  }

  if (
    typeof value.$type === "string" &&
    LEAFLET_RENDER_TIME_BLOCKS.has(value.$type)
  ) {
    return null;
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
    if (!inner) continue;
    if (
      (inner.$type === LEAFLET_BLOCK.page ||
        inner.$type === LEAFLET_BLOCK.embeddedCanvas) &&
      typeof inner.id === "string"
    ) {
      ids.push(inner.id);
    } else if (inner.$type === LEAFLET_PAGE.linearDocument) {
      ids.push(...collectReferencedPageIds(inner));
    }
  }
  return ids;
}

function appendReferencedPageBlocks(
  pageId: string,
  pagesById: Map<string, unknown>,
  visiting: Set<string>,
  result: Array<LeafletRenderableBlock>,
): void {
  if (visiting.has(pageId)) return;
  const referenced = pagesById.get(pageId);
  if (!isRecord(referenced)) return;

  visiting.add(pageId);
  try {
    const blocks = blocksForReferencedPage(referenced, pagesById, visiting);
    if (blocks.length === 0) return;
    result.push({
      kind: "pageEmbed",
      pageId,
      pageType:
        typeof referenced.$type === "string" ? referenced.$type : undefined,
      blocks,
    });
  } finally {
    visiting.delete(pageId);
  }
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
    if (inner) appendEntryBlocks(inner, pagesById, visiting, result);
  }
  return result;
}

/** Inline the canvas an `embeddedCanvas` block shows in full. */
function appendEmbeddedCanvasBlocks(
  inner: Record<string, unknown>,
  pagesById: Map<string, unknown>,
  visiting: Set<string>,
  result: Array<LeafletRenderableBlock>,
): void {
  const pageId = typeof inner.id === "string" ? inner.id : null;
  if (!pageId || visiting.has(pageId)) return;
  const referenced = pagesById.get(pageId);
  if (!isRecord(referenced)) return;

  visiting.add(pageId);
  try {
    if (referenced.$type === LEAFLET_PAGE.canvas) {
      const alt = typeof inner.alt === "string" ? inner.alt : undefined;
      result.push(
        ...blocksFromCanvasPage(referenced, pagesById, visiting, {
          root: false,
          alt,
        }),
      );
    } else {
      result.push(...resolvePageBlocks(referenced, pagesById, visiting));
    }
  } finally {
    visiting.delete(pageId);
  }
}

/**
 * Append what one page entry contributes: the block itself, the page a `page`
 * ref links to, the canvas an `embeddedCanvas` shows, or — on a canvas — the
 * blocks of a linear document placed there as one unit.
 */
function appendEntryBlocks(
  inner: Record<string, unknown>,
  pagesById: Map<string, unknown>,
  visiting: Set<string>,
  result: Array<LeafletRenderableBlock>,
): void {
  if (inner.$type === LEAFLET_BLOCK.page) {
    const pageId = typeof inner.id === "string" ? inner.id : null;
    if (pageId) appendReferencedPageBlocks(pageId, pagesById, visiting, result);
    return;
  }

  if (inner.$type === LEAFLET_BLOCK.embeddedCanvas) {
    appendEmbeddedCanvasBlocks(inner, pagesById, visiting, result);
    return;
  }

  if (inner.$type === LEAFLET_PAGE.linearDocument) {
    result.push(...resolvePageBlocks(inner, pagesById, visiting));
    return;
  }

  const parsed = asRenderableBlock(inner);
  if (parsed) result.push(parsed);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

interface CanvasEntry {
  record: Record<string, unknown>;
  x: number;
  y: number;
  stackOrder?: string;
}

/** Leaflet's reading order for canvas blocks: top to bottom, then left to right. */
function canvasReadingOrder(left: CanvasEntry, right: CanvasEntry): number {
  return left.y === right.y ? left.x - right.x : left.y - right.y;
}

/**
 * Leaflet's paint order, lowest first: blocks without a `stackOrder` predate
 * layering and sit below every layered block, in reading order; the rest
 * compare their fractional-index keys by code unit, not locale.
 */
function canvasPaintOrder(left: CanvasEntry, right: CanvasEntry): number {
  if (left.stackOrder === right.stackOrder) {
    return canvasReadingOrder(left, right);
  }
  if (left.stackOrder === undefined) return -1;
  if (right.stackOrder === undefined) return 1;
  return left.stackOrder < right.stackOrder ? -1 : 1;
}

/** The outermost canvas a block's placement chain hangs from. */
function outermostPlacement(
  placement: LeafletCanvasPlacement,
): LeafletCanvasPlacement {
  let current = placement;
  while (current.parent) current = current.parent;
  return current;
}

/**
 * A canvas page's blocks in reading order, each carrying where it sits. A
 * canvas shown on this one (an `embeddedCanvas` entry) keeps its own
 * placements, hung from this entry's.
 */
function blocksFromCanvasPage(
  page: Record<string, unknown>,
  pagesById: Map<string, unknown>,
  visiting: Set<string>,
  options: { root: boolean; alt?: string },
): Array<LeafletRenderableBlock> {
  const blocks = page.blocks;
  if (!Array.isArray(blocks)) return [];

  const background = isRecord(page.background) ? page.background : null;
  const frame: LeafletCanvasFrame = {
    pageId: typeof page.id === "string" ? page.id : "",
    width: positiveNumber(page.width),
    height: positiveNumber(page.height),
    pattern: typeof page.pattern === "string" ? page.pattern : undefined,
    background: background?.image
      ? {
          image: background.image,
          width: positiveNumber(background.width),
          opacity: finiteNumber(background.opacity),
        }
      : undefined,
    mobileView:
      typeof page.mobileView === "string" ? page.mobileView : undefined,
    alt: options.alt,
    root: options.root,
  };

  const entries: Array<CanvasEntry> = blocks
    .filter((entry) => isRecord(entry))
    .map((record) => ({
      record,
      x: finiteNumber(record.x) ?? 0,
      y: finiteNumber(record.y) ?? 0,
      stackOrder:
        typeof record.stackOrder === "string" ? record.stackOrder : undefined,
    }));
  const layers = new Map(
    entries
      .toSorted(canvasPaintOrder)
      .map((entry, index) => [entry, index + 1]),
  );

  const result: Array<LeafletRenderableBlock> = [];
  for (const [index, entry] of entries.toSorted(canvasReadingOrder).entries()) {
    const inner = unwrapPageBlock(entry.record);
    if (!inner) continue;

    const placement: LeafletCanvasPlacement = {
      frame,
      entry: index,
      x: entry.x,
      y: entry.y,
      width: positiveNumber(entry.record.width) ?? 0,
      height: positiveNumber(entry.record.height),
      rotation: finiteNumber(entry.record.rotation) || undefined,
      layer: layers.get(entry) ?? 0,
      alignment:
        typeof entry.record.alignment === "string"
          ? entry.record.alignment
          : undefined,
    };

    const entryBlocks: Array<LeafletRenderableBlock> = [];
    appendEntryBlocks(inner, pagesById, visiting, entryBlocks);
    for (const block of entryBlocks) {
      if (block.canvas) {
        // Already placed on a canvas shown inside this entry.
        const outermost = outermostPlacement(block.canvas);
        if (outermost.frame !== frame) outermost.parent ??= placement;
        result.push(block);
      } else {
        result.push({ ...block, canvas: placement });
      }
    }
  }
  return result;
}

function blocksForReferencedPage(
  referenced: Record<string, unknown>,
  pagesById: Map<string, unknown>,
  visiting: Set<string>,
): Array<LeafletRenderableBlock> {
  if (referenced.$type === LEAFLET_PAGE.canvas) {
    return blocksFromCanvasPage(referenced, pagesById, visiting, {
      root: false,
    });
  }
  return resolvePageBlocks(referenced, pagesById, visiting);
}

function blocksFromPage(
  page: unknown,
  pagesById: Map<string, unknown>,
): Array<LeafletRenderableBlock> {
  if (!isRecord(page)) return [];
  if (page.$type === LEAFLET_PAGE.canvas) {
    return blocksFromCanvasPage(page, pagesById, new Set(), { root: true });
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

/**
 * Whether one of the document's own pages is a canvas (as opposed to a canvas
 * shown inside a linear page), so the reader can give it a canvas-wide column.
 */
export function leafletHasRootCanvas(content: unknown): boolean {
  return leafletBlocks(content).some(
    (block) => block.canvas && outermostPlacement(block.canvas).frame.root,
  );
}

/** AT-URIs of every embedded Bluesky post block, in document order. */
export function leafletBskyPostUris(content: unknown): Array<string> {
  return leafletBlocks(content)
    .map((block) =>
      block.kind === "bskyPost" ? block.block.postRef?.uri : undefined,
    )
    .filter((uri): uri is string => typeof uri === "string" && uri.length > 0);
}

/** First header plaintext inside a page embed, for chrome labels. */
export function leafletPageEmbedLabel(
  blocks: Array<LeafletRenderableBlock>,
): string | null {
  for (const block of blocks) {
    if (block.kind === "header") {
      const text = block.block.plaintext.trim();
      if (text) return text;
    }
  }
  return null;
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
    case "standardSitePost":
    case "standardSitePublication": {
      return [];
    }
    case "pageEmbed": {
      return block.blocks.flatMap((nested) =>
        plaintextLinesFromBlock(nested, bskyPostText),
      );
    }
    case "image": {
      return narrationImageLines(block.block.alt);
    }
    case "imageGallery": {
      const images = block.block.images ?? [];
      return images.flatMap((image) => narrationImageLines(image.alt));
    }
    case "signup":
    case "drawing":
    case "membersOnlyDelimiter":
    case "horizontalRule":
    case "separator":
    case "poll":
    case "html":
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
