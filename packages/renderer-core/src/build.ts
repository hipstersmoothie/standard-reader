import {
  LEAFLET_DOCUMENT_FORMAT,
  leafletDocumentContent,
  structuredFormatBlocks,
} from "./document/content-formats";
import {
  structuredImageAspectRatio,
  structuredImageHasSource,
} from "./document/structured-content/image";
import type { StructuredRenderableBlock } from "./document/structured-content/types";
import { defaultImageUrlResolver, resolveGridImages } from "./image";
import { externalHttpUrl, isRecord } from "./internal";
import {
  asTextBlock as leafletAsTextBlock,
  leafletBlocks,
  leafletWebsiteSrc,
} from "./leaflet/blocks";
import { collectLeafletFootnotes } from "./leaflet/footnotes";
import { leafletImageAspectRatio } from "./leaflet/image";
import type {
  LeafletImageGalleryBlock,
  LeafletListItem,
  LeafletRenderableBlock,
} from "./leaflet/types";
import { LEAFLET_CONTENT } from "./leaflet/types";
import type {
  BlockNode,
  DocumentTree,
  FootnoteEntry,
  ListItem,
  RichText,
  TableRow,
} from "./nodes";
import { offprintBlocks } from "./offprint/blocks";
import { OFFPRINT_CONTENT } from "./offprint/types";
import {
  asTextBlock as pcktAsTextBlock,
  pcktBlocks,
  pcktCodeLanguage,
} from "./pckt/blocks";
import { pcktImageAlt, pcktImageAspectRatio } from "./pckt/image";
import type {
  PcktImageBlock,
  PcktListBlock,
  PcktRenderableBlock,
  PcktTableBlock,
  PcktTaskListBlock,
} from "./pckt/types";
import { PCKT_BLOCK } from "./pckt/types";
import type {
  ImageUrlResolver,
  RendererOptions,
  StandardSiteDocument,
} from "./types";

interface BuildContext {
  authorDid: string | undefined;
  resolveImageUrl: ImageUrlResolver;
}

function resolveFormat(doc: StandardSiteDocument): string | null {
  if (isRecord(doc.content) && typeof doc.content.$type === "string") {
    return doc.content.$type;
  }
  return doc.contentFormat ?? null;
}

/** Parsers key off `content.$type`; stamp it on when only `contentFormat` is set. */
function ensureType(content: unknown, format: string): unknown {
  if (isRecord(content) && typeof content.$type !== "string") {
    return { ...content, $type: format };
  }
  return content;
}

/**
 * Normalize a Standard Site document into the framework-agnostic
 * {@link DocumentTree}. Every supported content format is parsed and mapped
 * onto the shared {@link BlockNode} vocabulary; image URLs are resolved, leading
 * image/heading trimming and drop-cap selection are applied, and Leaflet
 * footnotes are collected and numbered.
 *
 * Returns `null` when the format is unsupported or the body is empty.
 */
export function buildRenderTree(
  doc: StandardSiteDocument,
  options?: RendererOptions,
): DocumentTree | null {
  const format = resolveFormat(doc);
  if (!format) return null;

  const ctx: BuildContext = {
    authorDid: doc.authorDid,
    resolveImageUrl: options?.resolveImageUrl ?? defaultImageUrlResolver,
  };
  const content = ensureType(doc.content, format);

  let children: Array<BlockNode>;
  let footnotes: Array<FootnoteEntry> = [];
  let footnoteNumbers: ReadonlyMap<string, number> = new Map();

  if (format === LEAFLET_CONTENT || format === LEAFLET_DOCUMENT_FORMAT) {
    const source =
      format === LEAFLET_DOCUMENT_FORMAT
        ? leafletDocumentContent(content)
        : content;
    const blocks = leafletBlocks(source);
    const collected = collectLeafletFootnotes(blocks);
    footnoteNumbers = collected.numberById;
    footnotes = collected.footnotes.map((fn) => ({
      id: fn.id,
      number: fn.number,
      text: { plaintext: fn.contentPlaintext, facets: fn.contentFacets },
    }));
    children = blocks.flatMap((block) => {
      const node = leafletToNode(block, ctx);
      return node ? [node] : [];
    });
  } else if (format === PCKT_CONTENT_FORMAT) {
    children = pcktBlocks(content).flatMap((block) => {
      const node = pcktToNode(block, ctx);
      return node ? [node] : [];
    });
  } else {
    const structured: Array<StructuredRenderableBlock> | null =
      format === OFFPRINT_CONTENT
        ? offprintBlocks(content)
        : structuredFormatBlocks(content, format);
    if (!structured) return null;
    children = structured.flatMap((block) => {
      const node = structuredToNode(block, ctx);
      return node ? [node] : [];
    });
  }

  children = applyLeadingTrims(children, doc.description, options);
  if (options?.dropCap) markDropCap(children);
  if (children.length === 0) return null;

  return { format, children, footnotes, footnoteNumbers };
}

const PCKT_CONTENT_FORMAT = "blog.pckt.content";

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------

function applyLeadingTrims(
  nodes: Array<BlockNode>,
  description: string | null | undefined,
  options: RendererOptions | undefined,
): Array<BlockNode> {
  let result = nodes;
  if (options?.skipLeadingImage && result[0]?.type === "image") {
    result = result.slice(1);
  }
  const desc = description?.trim();
  if (desc && result[0]?.type === "heading") {
    const first = result[0];
    if (first.text.plaintext.trim() === desc) result = result.slice(1);
  }
  return result;
}

function markDropCap(nodes: Array<BlockNode>): void {
  const node = nodes.find(
    (candidate) =>
      candidate.type === "paragraph" &&
      candidate.text.plaintext.trim().length > 0,
  );
  if (node && node.type === "paragraph") node.dropCap = true;
}

// ---------------------------------------------------------------------------
// Leaflet
// ---------------------------------------------------------------------------

function leafletListItem(item: LeafletListItem): ListItem | null {
  const text = leafletAsTextBlock(item.content);
  const runs: Array<RichText> =
    text && text.plaintext.trim()
      ? [{ plaintext: text.plaintext, facets: text.facets }]
      : [];
  const children: Array<BlockNode> = [];

  if (item.children?.length) {
    const nested = leafletListNode({ children: item.children }, "orderedList");
    if (nested) children.push(nested);
  }
  if (
    isRecord(item.unorderedListChildren) &&
    Array.isArray(item.unorderedListChildren.children) &&
    item.unorderedListChildren.children.length > 0
  ) {
    const nested = leafletListNode(
      item.unorderedListChildren as { children: Array<LeafletListItem> },
      "bulletList",
    );
    if (nested) children.push(nested);
  }
  if (
    isRecord(item.orderedListChildren) &&
    Array.isArray(item.orderedListChildren.children) &&
    item.orderedListChildren.children.length > 0
  ) {
    const nested = leafletListNode(
      item.orderedListChildren as {
        children: Array<LeafletListItem>;
        startIndex?: number;
      },
      "orderedList",
    );
    if (nested) children.push(nested);
  }

  if (runs.length === 0 && children.length === 0) return null;
  return { runs, children };
}

function leafletListNode(
  block: { children?: Array<LeafletListItem>; startIndex?: number },
  kind: "bulletList" | "orderedList",
): BlockNode | null {
  const items = (block.children ?? []).flatMap((item) => {
    const parsed = leafletListItem(item);
    return parsed ? [parsed] : [];
  });
  if (items.length === 0) return null;
  return kind === "orderedList"
    ? { type: "orderedList", start: block.startIndex, items }
    : { type: "bulletList", items };
}

function leafletToNode(
  block: LeafletRenderableBlock,
  ctx: BuildContext,
): BlockNode | null {
  switch (block.kind) {
    case "text": {
      return block.block.plaintext
        ? {
            type: "paragraph",
            dropCap: false,
            text: {
              plaintext: block.block.plaintext,
              facets: block.block.facets,
            },
          }
        : null;
    }
    case "header": {
      return block.block.plaintext
        ? {
            type: "heading",
            level: block.block.level ?? 2,
            text: {
              plaintext: block.block.plaintext,
              facets: block.block.facets,
            },
          }
        : null;
    }
    case "blockquote": {
      return {
        type: "blockquote",
        paragraphs: [
          { plaintext: block.block.plaintext, facets: block.block.facets },
        ],
      };
    }
    case "horizontalRule": {
      return { type: "horizontalRule" };
    }
    case "unorderedList": {
      return leafletListNode(block.block, "bulletList");
    }
    case "orderedList": {
      return leafletListNode(block.block, "orderedList");
    }
    case "bskyPost": {
      const uri = block.block.postRef?.uri;
      return uri ? { type: "blueskyEmbed", postUri: uri } : null;
    }
    case "image": {
      const src = ctx.resolveImageUrl({
        blob: block.block.image,
        authorDid: ctx.authorDid,
      });
      if (!src) return null;
      return {
        type: "image",
        src,
        alt: block.block.alt?.trim() || "",
        aspectRatio: leafletImageAspectRatio(block.block),
        fullBleed: block.block.fullBleed,
      };
    }
    case "code": {
      return {
        type: "code",
        code: block.block.plaintext,
        language: block.block.language,
      };
    }
    case "iframe": {
      return {
        type: "iframe",
        url: block.block.url ?? "",
        height: block.block.height,
        aspectRatio: block.block.aspectRatio,
      };
    }
    case "website": {
      const src = leafletWebsiteSrc(block.block);
      return src
        ? {
            type: "website",
            src,
            title: block.block.title,
            description: block.block.description,
            previewImage: block.block.previewImage,
          }
        : null;
    }
    case "math": {
      const tex = block.block.tex?.trim();
      return tex ? { type: "math", tex } : null;
    }
    case "button": {
      const href = block.block.url?.trim();
      const text = block.block.text?.trim();
      return href && text ? { type: "button", href, text } : null;
    }
    case "poll": {
      const uri = block.block.pollRef?.uri;
      return uri ? { type: "leaflet.poll", pollUri: uri } : null;
    }
    case "separator": {
      return { type: "leaflet.separator" };
    }
    case "standardSitePost": {
      const uri = block.block.uri;
      return uri ? { type: "leaflet.standardSitePost", uri } : null;
    }
    case "standardSitePublication": {
      const uri = block.block.uri;
      return uri
        ? {
            type: "leaflet.standardSitePublication",
            uri,
            cid: block.block.cid,
            showPublicationTheme: block.block.showPublicationTheme,
          }
        : null;
    }
    case "imageGallery": {
      return leafletGalleryNode(block.block, ctx);
    }
    case "signup": {
      return { type: "leaflet.signup" };
    }
    case "pageEmbed": {
      return {
        type: "leaflet.pageEmbed",
        pageId: block.pageId,
        pageType: block.pageType,
        children: block.blocks.flatMap((nested) => {
          const node = leafletToNode(nested, ctx);
          return node ? [node] : [];
        }),
      };
    }
    case "unknown": {
      return { type: "unknown", blockType: block.blockType };
    }
  }
}

function leafletGalleryNode(
  block: LeafletImageGalleryBlock,
  ctx: BuildContext,
): BlockNode | null {
  const images = (block.images ?? []).flatMap((image) => {
    const src = ctx.resolveImageUrl({
      blob: image.image,
      authorDid: ctx.authorDid,
    });
    if (!src) return [];
    return [
      {
        src,
        alt: image.alt?.trim() || "",
        aspectRatio: leafletImageAspectRatio(image),
      },
    ];
  });
  if (images.length === 0) return null;
  const layout = block.format?.trim() || "grid";
  return layout === "carousel"
    ? { type: "imageCarousel", images, layout }
    : { type: "imageGrid", images, layout };
}

// ---------------------------------------------------------------------------
// pckt
// ---------------------------------------------------------------------------

function pcktImageSrc(block: PcktImageBlock, ctx: BuildContext): string | null {
  const attrs = block.attrs;
  if (!attrs) return null;
  const src = attrs.src;
  if (externalHttpUrl(src)) {
    return ctx.resolveImageUrl({ externalSrc: src, authorDid: ctx.authorDid });
  }
  let blob = attrs.blob;
  if (blob == null && typeof src === "string" && src.startsWith("blob:")) {
    const cid = src.slice("blob:".length);
    if (cid) blob = { ref: cid };
  }
  return ctx.resolveImageUrl({ blob, authorDid: ctx.authorDid });
}

function pcktRuns(content: Array<Record<string, unknown>> | undefined): {
  runs: Array<RichText>;
  children: Array<BlockNode>;
} {
  const runs: Array<RichText> = [];
  const children: Array<BlockNode> = [];
  for (const entry of content ?? []) {
    const text = pcktAsTextBlock(entry);
    if (text?.plaintext.trim()) {
      runs.push({ plaintext: text.plaintext, facets: text.facets });
      continue;
    }
    if (!isRecord(entry)) continue;
    if (entry.$type === PCKT_BLOCK.bulletList) {
      const node = pcktListNode(entry as PcktListBlock, "bulletList");
      if (node) children.push(node);
    } else if (entry.$type === PCKT_BLOCK.orderedList) {
      const node = pcktListNode(entry as PcktListBlock, "orderedList");
      if (node) children.push(node);
    } else if (entry.$type === PCKT_BLOCK.taskList) {
      const node = pcktTaskListNode(entry as PcktTaskListBlock);
      if (node) children.push(node);
    }
  }
  return { runs, children };
}

function pcktListNode(
  block: PcktListBlock,
  kind: "bulletList" | "orderedList",
): BlockNode | null {
  const items = (block.content ?? []).flatMap((child) => {
    if (!isRecord(child)) return [];
    const { runs, children } = pcktRuns(
      child.content as Array<Record<string, unknown>> | undefined,
    );
    if (runs.length === 0 && children.length === 0) return [];
    return [{ runs, children }];
  });
  if (items.length === 0) return null;
  return kind === "orderedList"
    ? { type: "orderedList", start: block.start, items }
    : { type: "bulletList", items };
}

function pcktTaskListNode(block: PcktTaskListBlock): BlockNode | null {
  const items = (block.content ?? []).flatMap((child) => {
    if (!isRecord(child)) return [];
    const { runs } = pcktRuns(
      child.content as Array<Record<string, unknown>> | undefined,
    );
    if (runs.length === 0) return [];
    const checked = Boolean(
      isRecord(child.attrs) && child.attrs.checked === true,
    );
    return [{ checked, runs }];
  });
  return items.length > 0 ? { type: "taskList", items } : null;
}

function pcktTableNode(block: PcktTableBlock): BlockNode | null {
  const rows: Array<TableRow> = [];
  for (const row of block.content ?? []) {
    if (!isRecord(row)) continue;
    const cells = row.content as Array<Record<string, unknown>> | undefined;
    if (!cells?.length) continue;
    const rowCells = cells.flatMap((cell) => {
      if (!isRecord(cell)) return [];
      const header = cell.$type === PCKT_BLOCK.tableHeader;
      const { runs } = pcktRuns(
        cell.content as Array<Record<string, unknown>> | undefined,
      );
      return [{ header, text: mergeRuns(runs) }];
    });
    if (rowCells.length > 0) rows.push(rowCells);
  }
  return rows.length > 0 ? { type: "table", rows } : null;
}

/** Collapse multiple inline runs into one rich-text value (facets from first). */
function mergeRuns(runs: Array<RichText>): RichText {
  if (runs.length <= 1) return runs[0] ?? { plaintext: "" };
  return {
    plaintext: runs.map((run) => run.plaintext).join(""),
    facets: runs[0]?.facets,
  };
}

function pcktToNode(
  block: PcktRenderableBlock,
  ctx: BuildContext,
): BlockNode | null {
  switch (block.kind) {
    case "text": {
      return block.block.plaintext
        ? {
            type: "paragraph",
            dropCap: false,
            text: {
              plaintext: block.block.plaintext,
              facets: block.block.facets,
            },
          }
        : null;
    }
    case "heading": {
      return block.block.plaintext
        ? {
            type: "heading",
            level: block.block.level ?? 2,
            text: {
              plaintext: block.block.plaintext,
              facets: block.block.facets,
            },
          }
        : null;
    }
    case "blockquote": {
      const { runs } = pcktRuns(
        block.block.content as Array<Record<string, unknown>> | undefined,
      );
      return runs.length > 0 ? { type: "blockquote", paragraphs: runs } : null;
    }
    case "horizontalRule": {
      return { type: "horizontalRule" };
    }
    case "bulletList": {
      return pcktListNode(block.block, "bulletList");
    }
    case "orderedList": {
      return pcktListNode(block.block, "orderedList");
    }
    case "taskList": {
      return pcktTaskListNode(block.block);
    }
    case "blueskyEmbed": {
      const uri = block.block.postRef?.uri;
      return uri ? { type: "blueskyEmbed", postUri: uri } : null;
    }
    case "image": {
      const src = pcktImageSrc(block.block, ctx);
      if (!src) return null;
      return {
        type: "image",
        src,
        alt: pcktImageAlt(block.block),
        aspectRatio: pcktImageAspectRatio(block.block),
      };
    }
    case "code": {
      return {
        type: "code",
        code: block.block.plaintext,
        language: pcktCodeLanguage(block.block),
      };
    }
    case "iframe": {
      return {
        type: "iframe",
        url: block.block.url ?? block.block.attrs?.url ?? "",
        height: block.block.height,
      };
    }
    case "table": {
      return pcktTableNode(block.block);
    }
    case "website": {
      return {
        type: "website",
        src: block.block.src ?? "",
        title: block.block.title,
        description: block.block.description,
        previewImage: block.block.previewImage,
      };
    }
    case "gallery": {
      const ref = block.block.ref;
      return ref ? { type: "pckt.gallery", ref } : null;
    }
    case "noteEmbed": {
      return {
        type: "pckt.noteEmbed",
        uri: block.block.noteRef?.uri,
        cid: block.block.noteRef?.cid,
      };
    }
    case "unknown": {
      return { type: "unknown", blockType: block.blockType };
    }
  }
}

// ---------------------------------------------------------------------------
// Structured (Offprint + third-party)
// ---------------------------------------------------------------------------

function structuredToNode(
  block: StructuredRenderableBlock,
  ctx: BuildContext,
): BlockNode | null {
  switch (block.kind) {
    case "text": {
      return block.text.plaintext
        ? { type: "paragraph", dropCap: false, text: block.text }
        : null;
    }
    case "heading": {
      return block.text.plaintext
        ? { type: "heading", level: block.level ?? 2, text: block.text }
        : null;
    }
    case "blockquote": {
      const paragraphs = block.blocks.flatMap((nested) => {
        if (nested.kind === "text" || nested.kind === "heading") {
          return nested.text.plaintext.trim() ? [nested.text] : [];
        }
        return [];
      });
      return paragraphs.length > 0 ? { type: "blockquote", paragraphs } : null;
    }
    case "callout": {
      return {
        type: "callout",
        text: block.text,
        emoji: block.emoji,
        color: block.color,
      };
    }
    case "horizontalRule": {
      return { type: "horizontalRule" };
    }
    case "bulletList": {
      return {
        type: "bulletList",
        items: block.items.map((text) => ({ runs: [text], children: [] })),
      };
    }
    case "orderedList": {
      return {
        type: "orderedList",
        start: block.start,
        items: block.items.map((text) => ({ runs: [text], children: [] })),
      };
    }
    case "taskList": {
      return {
        type: "taskList",
        items: block.items.map((item) => ({
          checked: item.checked === true,
          runs: [item.text],
        })),
      };
    }
    case "blueskyEmbed": {
      return { type: "blueskyEmbed", postUri: block.postUri };
    }
    case "image": {
      if (!structuredImageHasSource(block)) return null;
      const src = ctx.resolveImageUrl({
        blob: block.blob,
        externalSrc: block.externalSrc,
        authorDid: ctx.authorDid,
      });
      if (!src) return null;
      return {
        type: "image",
        src,
        alt: block.alt?.trim() || "",
        aspectRatio: structuredImageAspectRatio(block),
      };
    }
    case "code": {
      return { type: "code", code: block.plaintext, language: block.language };
    }
    case "iframe": {
      return { type: "iframe", url: block.url, height: block.height };
    }
    case "website": {
      return {
        type: "website",
        src: block.src,
        title: block.title,
        description: block.description,
        previewImage: block.previewImage,
      };
    }
    case "table": {
      return {
        type: "table",
        rows: block.rows.map((row) =>
          row.map((cell) => ({
            header: cell.isHeader === true,
            text: cell.text,
          })),
        ),
      };
    }
    case "gallery": {
      return { type: "pckt.gallery", ref: block.ref };
    }
    case "button": {
      return {
        type: "button",
        text: block.text,
        href: block.href,
        caption: block.caption,
        alignment: block.alignment,
      };
    }
    case "math": {
      return { type: "math", tex: block.tex };
    }
    case "imageGrid": {
      const images = resolveGridImages(
        block.images,
        ctx.resolveImageUrl,
        ctx.authorDid,
      );
      return images.length > 0
        ? { type: "imageGrid", images, caption: block.caption }
        : null;
    }
    case "imageCarousel": {
      const images = resolveGridImages(
        block.images,
        ctx.resolveImageUrl,
        ctx.authorDid,
      );
      return images.length > 0
        ? { type: "imageCarousel", images, caption: block.caption }
        : null;
    }
    case "imageDiff": {
      const images = resolveGridImages(
        block.images,
        ctx.resolveImageUrl,
        ctx.authorDid,
      );
      if (images.length !== 2) return null;
      const [before, after] = images;
      if (!before || !after) return null;
      return {
        type: "imageDiff",
        before,
        after,
        caption: block.caption,
        labels: block.labels,
      };
    }
    case "offprintComponent": {
      return { type: "offprint.component", componentUri: block.componentUri };
    }
    case "unknown": {
      return { type: "unknown", blockType: block.blockType };
    }
  }
}
