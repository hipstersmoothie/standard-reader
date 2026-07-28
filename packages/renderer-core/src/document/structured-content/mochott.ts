/**
 * Mochott (`site.mochott.article`) — the TipTap document format behind the
 * [mochott](https://mochott.site) blog platform.
 *
 * Mochott writes every post twice: a `site.standard.document` carrying the card
 * metadata (title, description, cover image, a plaintext `textContent`) and a
 * `site.mochott.article` **at the same rkey** holding the body. Only the
 * article record has the renderable content, so that is what this module
 * parses — a TipTap (ProseMirror) `doc` tree under the record's `content`.
 *
 * The vocabulary is ProseMirror's with mochott's own nodes layered on:
 *
 *   · `linkCard`    — an OGP link preview (url + title + description + image).
 *   · `embed`       — an oEmbed-style player (`service` + `embedUrl`).
 *   · `footnote`    — an *inline* node carrying its body in `attrs.content`,
 *                     with no separate definition to pair it against.
 *   · `customBlock` — a user-defined HTML template stored as a
 *                     `site.mochott.block` record and snapshotted into the
 *                     article alongside the values to interpolate into it.
 *
 * Everything lands in the shared {@link StructuredRenderableBlock} vocabulary —
 * no mochott-specific node types and no per-renderer code. Inline marks become
 * byte-indexed AT-Proto facets exactly like the other block formats, and the
 * inline footnotes are lifted into the document-level footnote channel that
 * `buildRenderTree` numbers.
 *
 * Images reference a PDS blob through mochott's own image proxy
 * (`/api/image/{did}/{cid}`), so the CID is recovered from the URL and handed
 * to the normal blob resolver rather than pointing a renderer at mochott.
 *
 * Knowingly dropped: `textAlign` on paragraphs and headings (the block
 * vocabulary has no alignment), `colwidth` on table cells, and a custom
 * block's `css` (page-global stylesheet text, not block content).
 */

import { externalHttpUrl, isRecord } from "../../internal.js";
import { utf8ByteLength } from "../../leaflet/utf8.js";
import { normalizeImageAlt } from "./image.js";
import type { MarkdownDocument } from "./markdown.js";
import { syntheticFacet } from "./text-runs.js";
import type {
  StructuredListItem,
  StructuredRenderableBlock,
  StructuredTableCell,
  StructuredTableRow,
  StructuredText,
} from "./types.js";

/** The article record; its `content` is the TipTap document. */
export const MOCHOTT_ARTICLE = "site.mochott.article";
/** The TipTap document on its own, when stored without the record around it. */
export const MOCHOTT_TIPTAP = "site.mochott.article#tiptapDocument";

/** Content `$type`s handled by this module. */
export const MOCHOTT_FORMATS = [MOCHOTT_ARTICLE, MOCHOTT_TIPTAP];

export function isMochottFormat(format: string | null | undefined): boolean {
  return format === MOCHOTT_ARTICLE || format === MOCHOTT_TIPTAP;
}

/**
 * The TipTap `doc` node inside a payload — either a whole `site.mochott.article`
 * record (body under `content`) or the bare document node.
 */
export function mochottDocNode(
  content: unknown,
): Record<string, unknown> | null {
  if (!isRecord(content)) return null;
  if (content.type === "doc") return content;
  if (isRecord(content.content) && content.content.type === "doc") {
    return content.content;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Inline: TipTap text runs + marks → StructuredText
// ---------------------------------------------------------------------------

/** TipTap mark name → the facet suffix the shared renderer recognizes. */
const MARK_KINDS: Record<string, string> = {
  bold: "bold",
  code: "code",
  em: "italic",
  highlight: "highlight",
  italic: "italic",
  s: "strikethrough",
  strike: "strikethrough",
  strikethrough: "strikethrough",
  strong: "bold",
  underline: "underline",
};

interface MarkInfo {
  kinds: Array<string>;
  linkUri?: string;
}

function markAttrs(mark: Record<string, unknown>): Record<string, unknown> {
  return isRecord(mark.attrs) ? mark.attrs : {};
}

function parseMarks(marks: unknown): MarkInfo {
  const info: MarkInfo = { kinds: [] };
  if (!Array.isArray(marks)) return info;
  for (const mark of marks) {
    if (!isRecord(mark) || typeof mark.type !== "string") continue;
    if (mark.type === "link") {
      // TipTap keeps the target under `attrs`; tolerate a flattened `href`.
      const href = markAttrs(mark).href ?? mark.href;
      const uri = externalHttpUrl(href);
      if (uri) info.linkUri = uri;
      continue;
    }
    const kind = MARK_KINDS[mark.type];
    if (kind) info.kinds.push(kind);
  }
  return info;
}

/** A footnote lifted out of the inline flow, awaiting its number. */
interface CollectedFootnote {
  id: string;
  text: StructuredText;
}

/**
 * Mochott footnotes are inline nodes with no identifier of their own, so ids
 * are minted in document order — the same order `buildRenderTree` numbers them
 * in.
 */
class FootnoteCollector {
  readonly notes: Array<CollectedFootnote> = [];

  /** Register a `footnote` node; returns its id and body, or null when empty. */
  add(node: Record<string, unknown>): CollectedFootnote | null {
    const attrs = isRecord(node.attrs) ? node.attrs : {};
    const content =
      typeof attrs.content === "string" ? attrs.content.trim() : "";
    if (!content) return null;
    const note = {
      id: `mochott-footnote-${this.notes.length + 1}`,
      text: { plaintext: content },
    };
    this.notes.push(note);
    return note;
  }
}

interface InlineRun {
  text: string;
  kinds: Array<string>;
  link?: string;
  /** A footnote referenced immediately after this run. */
  footnote?: CollectedFootnote;
}

/** Flatten a node's inline `content` into styled runs. */
function collectRuns(
  nodes: Array<unknown>,
  footnotes: FootnoteCollector,
  out: Array<InlineRun>,
): void {
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    if (node.type === "hardBreak") {
      out.push({ kinds: [], text: "\n" });
      continue;
    }
    if (node.type === "footnote") {
      // The marker facet spans the text it annotates, so it attaches to the run
      // just before it. A note with nothing in front of it still renders as an
      // endnote; it just gets no inline marker.
      const note = footnotes.add(node);
      const previous = out.at(-1);
      if (note && previous?.text.trim()) previous.footnote = note;
      continue;
    }
    if (node.type === "text" && typeof node.text === "string") {
      const { kinds, linkUri } = parseMarks(node.marks);
      out.push({ kinds, link: linkUri, text: node.text });
      continue;
    }
    // Any other inline node (mentions, inline images, …): keep whatever text it
    // nests rather than dropping the sentence around it.
    if (Array.isArray(node.content)) collectRuns(node.content, footnotes, out);
  }
}

function runsToText(runs: Array<InlineRun>): StructuredText | null {
  let plaintext = "";
  const facets: Array<unknown> = [];

  for (const run of runs) {
    const byteStart = utf8ByteLength(plaintext);
    plaintext += run.text;
    const byteEnd = utf8ByteLength(plaintext);
    const facet = syntheticFacet(byteStart, byteEnd, run.kinds, run.link);

    if (run.footnote && byteEnd > byteStart) {
      const feature = {
        $type: "site.standard.richtext.facet#footnote",
        contentPlaintext: run.footnote.text.plaintext,
        footnoteId: run.footnote.id,
      };
      if (facet) {
        (facet.features as Array<unknown>).push(feature);
        facets.push(facet);
      } else {
        facets.push({ features: [feature], index: { byteEnd, byteStart } });
      }
      continue;
    }
    if (facet) facets.push(facet);
  }

  if (!plaintext.trim()) return null;
  return facets.length > 0 ? { facets, plaintext } : { plaintext };
}

/** Rich text for a node's inline content, or null when it carries none. */
function inlineText(
  node: Record<string, unknown>,
  footnotes: FootnoteCollector,
): StructuredText | null {
  const runs: Array<InlineRun> = [];
  collectRuns(Array.isArray(node.content) ? node.content : [], footnotes, runs);
  return runsToText(runs);
}

/** Rich text for a run of block nodes, joining their paragraphs with newlines. */
function blocksText(
  nodes: Array<unknown>,
  footnotes: FootnoteCollector,
): StructuredText | null {
  const runs: Array<InlineRun> = [];
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    if (runs.length > 0) runs.push({ kinds: [], text: "\n" });
    collectRuns(
      Array.isArray(node.content) ? node.content : [],
      footnotes,
      runs,
    );
  }
  return runsToText(runs);
}

// ---------------------------------------------------------------------------
// Blocks: TipTap nodes → StructuredRenderableBlock
// ---------------------------------------------------------------------------

function attrsOf(node: Record<string, unknown>): Record<string, unknown> {
  return isRecord(node.attrs) ? node.attrs : {};
}

function childNodes(node: Record<string, unknown>): Array<unknown> {
  return Array.isArray(node.content) ? node.content : [];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * The blob CID behind a mochott image URL. Images are served through mochott's
 * proxy (`/api/image/{did}/{cid}`) or its imgix mirror
 * (`/images/{did}/{cid}?…`), both of which end in the PDS blob CID.
 */
function mochottBlobCid(src: string): string | null {
  let path = src;
  if (externalHttpUrl(src)) {
    try {
      path = new URL(src).pathname;
    } catch {
      return null;
    }
  }
  const match = /^\/(?:api\/image|images)\/[^/]+\/([^/?#]+)$/.exec(path);
  const cid = match?.[1];
  // Base32 CIDs (`bafkrei…`/`bafyrei…`); anything else is not a blob ref.
  return cid && /^b[a-z2-7]{20,}$/.test(cid) ? cid : null;
}

function imageBlock(
  node: Record<string, unknown>,
): StructuredRenderableBlock | null {
  const attrs = attrsOf(node);
  const src = typeof attrs.src === "string" ? attrs.src.trim() : "";
  if (!src) return null;

  const width = optionalNumber(attrs.width);
  const height = optionalNumber(attrs.height);
  const block: Extract<StructuredRenderableBlock, { kind: "image" }> = {
    // `alt` is nearly always empty in practice and `title` carries the
    // description mochott shows under the image, so it becomes the caption.
    alt: normalizeImageAlt(optionalString(attrs.alt)) || undefined,
    caption: optionalString(attrs.title),
    kind: "image",
  };
  if (width != null || height != null) block.aspectRatio = { height, width };

  const cid = mochottBlobCid(src);
  if (cid) {
    block.blob = { ref: cid };
    return block;
  }
  const external = externalHttpUrl(src);
  if (!external) return null;
  block.externalSrc = external;
  return block;
}

/** `linkCard` — an OGP preview of an external page. */
function linkCardBlock(
  node: Record<string, unknown>,
): StructuredRenderableBlock | null {
  const attrs = attrsOf(node);
  const src = externalHttpUrl(attrs.url);
  if (!src) return null;
  return {
    description: optionalString(attrs.description),
    kind: "website",
    previewImage: externalHttpUrl(attrs.image) ?? undefined,
    src,
    title: optionalString(attrs.title),
  };
}

/** `embed` — a player URL (YouTube &c.); falls back to a link card. */
function embedBlock(
  node: Record<string, unknown>,
): StructuredRenderableBlock | null {
  const attrs = attrsOf(node);
  const embedUrl = externalHttpUrl(attrs.embedUrl);
  if (embedUrl) return { kind: "iframe", url: embedUrl };
  const src = externalHttpUrl(attrs.src);
  return src ? { kind: "website", src } : null;
}

const TEMPLATE_PLACEHOLDER = /\{\{\s*([\w.-]+)\s*\}\}/g;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Per-field defaults declared by the snapshotted `site.mochott.block`. */
function fieldDefaults(snapshot: Record<string, unknown>): Map<string, string> {
  const defaults = new Map<string, string>();
  if (!Array.isArray(snapshot.fields)) return defaults;
  for (const field of snapshot.fields) {
    if (!isRecord(field) || typeof field.key !== "string") continue;
    if (typeof field.default === "string")
      defaults.set(field.key, field.default);
  }
  return defaults;
}

/**
 * `customBlock` — the author's own HTML template with `{{field}}` holes, plus
 * the values to fill them. Values are escaped: only the template author's
 * markup is markup. The result is a raw-HTML block, which a consumer must
 * sanitize before rendering (see the `html` node in `nodes.ts`).
 */
function customBlock(
  node: Record<string, unknown>,
): StructuredRenderableBlock | null {
  const attrs = attrsOf(node);
  const snapshot = isRecord(attrs.snapshot) ? attrs.snapshot : null;
  const template = typeof snapshot?.html === "string" ? snapshot.html : "";
  if (!template.trim()) return null;

  const values = isRecord(attrs.values) ? attrs.values : {};
  const defaults = fieldDefaults(snapshot ?? {});
  const html = template.replaceAll(TEMPLATE_PLACEHOLDER, (_match, key) => {
    const value = values[key as string];
    const text =
      typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : (defaults.get(key as string) ?? "");
    return escapeHtml(text);
  });
  return { html, kind: "html" };
}

function tableCell(
  node: unknown,
  footnotes: FootnoteCollector,
): StructuredTableCell | null {
  if (!isRecord(node)) return null;
  if (node.type !== "tableCell" && node.type !== "tableHeader") return null;
  const text = blocksText(childNodes(node), footnotes) ?? { plaintext: "" };
  return node.type === "tableHeader" ? { isHeader: true, text } : { text };
}

function tableBlock(
  node: Record<string, unknown>,
  footnotes: FootnoteCollector,
): StructuredRenderableBlock | null {
  const rows: StructuredTableRow = [];
  for (const row of childNodes(node)) {
    if (!isRecord(row) || row.type !== "tableRow") continue;
    const cells = childNodes(row).flatMap((cell) => {
      const parsed = tableCell(cell, footnotes);
      return parsed ? [parsed] : [];
    });
    if (cells.length > 0) rows.push(cells);
  }
  return rows.length > 0 ? { kind: "table", rows } : null;
}

/** A `listItem`: its own paragraphs, plus any list nested beneath it. */
function listItem(
  node: unknown,
  footnotes: FootnoteCollector,
): StructuredListItem | null {
  if (!isRecord(node)) return null;
  const paragraphs: Array<unknown> = [];
  const children: Array<StructuredRenderableBlock> = [];

  for (const child of childNodes(node)) {
    if (!isRecord(child)) continue;
    if (child.type === "paragraph" || child.type === "heading") {
      paragraphs.push(child);
      continue;
    }
    const block = asBlock(child, footnotes);
    if (block) children.push(block);
  }

  const text = blocksText(paragraphs, footnotes);
  if (!text && children.length === 0) return null;
  return children.length > 0
    ? { children, text: text ?? { plaintext: "" } }
    : { text: text ?? { plaintext: "" } };
}

function listBlock(
  node: Record<string, unknown>,
  footnotes: FootnoteCollector,
): StructuredRenderableBlock | null {
  const items = childNodes(node).flatMap((child) => {
    const item = listItem(child, footnotes);
    return item ? [item] : [];
  });
  if (items.length === 0) return null;
  if (node.type === "orderedList") {
    const start = optionalNumber(attrsOf(node).start);
    return start != null && start !== 1
      ? { items, kind: "orderedList", start }
      : { items, kind: "orderedList" };
  }
  return { items, kind: "bulletList" };
}

function asBlock(
  node: unknown,
  footnotes: FootnoteCollector,
): StructuredRenderableBlock | null {
  if (!isRecord(node) || typeof node.type !== "string") return null;

  switch (node.type) {
    case "paragraph": {
      const text = inlineText(node, footnotes);
      return text ? { kind: "text", text } : null;
    }
    case "heading": {
      const text = inlineText(node, footnotes);
      if (!text) return null;
      const level = optionalNumber(attrsOf(node).level ?? node.level);
      return { kind: "heading", level, text };
    }
    case "bulletList":
    case "orderedList": {
      return listBlock(node, footnotes);
    }
    case "blockquote": {
      const blocks = childNodes(node).flatMap((child) => {
        const block = asBlock(child, footnotes);
        return block ? [block] : [];
      });
      return blocks.length > 0 ? { blocks, kind: "blockquote" } : null;
    }
    case "codeBlock": {
      const runs: Array<InlineRun> = [];
      collectRuns(childNodes(node), footnotes, runs);
      const plaintext = runs.map((run) => run.text).join("");
      return plaintext.trim()
        ? {
            kind: "code",
            language: optionalString(attrsOf(node).language),
            plaintext,
          }
        : null;
    }
    case "horizontalRule": {
      return { kind: "horizontalRule" };
    }
    case "image": {
      return imageBlock(node);
    }
    case "linkCard": {
      return linkCardBlock(node);
    }
    case "embed": {
      return embedBlock(node);
    }
    case "table": {
      return tableBlock(node, footnotes);
    }
    case "customBlock": {
      return customBlock(node);
    }
    default: {
      return { blockType: node.type, kind: "unknown" };
    }
  }
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Blocks *and* footnotes for a `site.mochott.article` payload, or null when the
 * format doesn't match or the body is empty. Mochott's footnotes are inline
 * nodes, so they are lifted here into the document-level channel
 * `buildRenderTree` numbers.
 */
export function mochottDocument(
  content: unknown,
  contentFormat?: string | null,
): MarkdownDocument | null {
  const format =
    isRecord(content) && typeof content.$type === "string"
      ? content.$type
      : contentFormat;
  if (!isMochottFormat(format)) return null;

  const doc = mochottDocNode(content);
  if (!doc) return null;

  const footnotes = new FootnoteCollector();
  const blocks = childNodes(doc).flatMap((node) => {
    const block = asBlock(node, footnotes);
    return block ? [block] : [];
  });
  if (blocks.length === 0) return null;
  return { blocks, footnotes: footnotes.notes };
}

/**
 * Renderable blocks for a `site.mochott.article` payload. Registered for every
 * {@link MOCHOTT_FORMATS} entry so `buildRenderTree` handles mochott like any
 * other structured format; use {@link mochottDocument} when you also want the
 * footnotes.
 */
export function mochottBlocks(
  content: unknown,
  contentFormat?: string | null,
): Array<StructuredRenderableBlock> | null {
  return mochottDocument(content, contentFormat)?.blocks ?? null;
}
