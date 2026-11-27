import { buildRenderTree } from "@standard-reader/renderer-core";
import rehypeParse from "rehype-parse";
import rehypeSanitize from "rehype-sanitize";
import { unified } from "unified";

import {
  ALT_MARKDOWN_FORMATS,
  HTML_CONTENT_FORMATS,
  LEAFLET_DOCUMENT_FORMAT,
  STRUCTURED_BLOCK_FORMATS,
  htmlContentBody,
  leafletDocumentContent,
  structuredFormatBlocks,
} from "#/lib/document/content-formats";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { leafletBlocks } from "#/lib/leaflet/blocks";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { articleMarkdownSanitizeSchema } from "#/lib/markdown/article-sanitize-schema";
import { MARKPUB_MARKDOWN } from "#/lib/markpub/types";
import { MOCHOTT_ARTICLE } from "#/lib/mochott/types";
import { offprintBlocks } from "#/lib/offprint/blocks";
import { OFFPRINT_CONTENT } from "#/lib/offprint/types";
import {
  pcktBlocks,
  pcktLeadingHeadingMatchesDescription,
} from "#/lib/pckt/blocks";
import { PCKT_CONTENT } from "#/lib/pckt/types";

/**
 * An article's heading outline — what the reader's table of contents lists and
 * what every heading renderer looks its anchor id up in.
 *
 * The outline is derived from the *parsed blocks* of each content format, the
 * same parse the matching renderer walks (see `renderers/index.ts`), so it is
 * available during SSR and never has to wait for the DOM. Headings are matched
 * back to their entry by text (`HeadingAnchorRegistry`), which keeps every
 * renderer's heading component free of positional bookkeeping.
 */
export interface HeadingOutlineEntry {
  /** Stable, unique anchor id — the heading's `id` and the TOC link target. */
  id: string;
  /** 1–6, as authored. */
  level: number;
  /** Whitespace-normalized plaintext. */
  text: string;
}

/** Fewer headings than this and a table of contents is just noise. */
export const MIN_TOC_HEADINGS = 3;

const MAX_SLUG_LENGTH = 64;

/** Collapse runs of whitespace (incl. newlines from hard breaks) and trim. */
export function normalizeHeadingText(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

/**
 * GitHub-style anchor slug: lowercased, punctuation dropped, whitespace to
 * hyphens. Letters and digits from every script survive (`\p{L}`/`\p{N}`), so a
 * Japanese or Arabic heading gets a readable id rather than an empty one.
 */
export function headingAnchorSlug(text: string): string {
  const slug = normalizeHeadingText(text)
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .trim()
    .replaceAll(/[\s_-]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replaceAll(/^-+|-+$/g, "");
  return slug || "section";
}

/**
 * Turn raw `{ level, text }` headings into outline entries: empty headings are
 * dropped, levels clamped to 1–6, and repeated slugs suffixed (`-2`, `-3`, …)
 * so every id is unique within the article.
 */
export function buildHeadingOutline(
  headings: Iterable<{ level?: number; text: string }>,
): Array<HeadingOutlineEntry> {
  const outline: Array<HeadingOutlineEntry> = [];
  const used = new Set<string>();

  for (const heading of headings) {
    const text = normalizeHeadingText(heading.text);
    if (!text) continue;

    const base = headingAnchorSlug(text);
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n.toString()}`;
    used.add(id);

    const level = Math.min(6, Math.max(1, Math.round(heading.level ?? 2)));
    outline.push({ id, level, text });
  }

  return outline;
}

/** One outline entry plus the entries nested under it. */
export interface TocNode {
  entry: HeadingOutlineEntry;
  children: Array<TocNode>;
}

/**
 * Nest a flat outline by heading level: each entry owns the entries after it
 * with a deeper level, up to the next entry at its own level or shallower.
 * Skipped levels (an h2 followed straight by an h4) nest one step, not two.
 */
export function nestHeadingOutline(
  outline: ReadonlyArray<HeadingOutlineEntry>,
): Array<TocNode> {
  const roots: Array<TocNode> = [];
  const stack: Array<TocNode> = [];

  for (const entry of outline) {
    const node: TocNode = { entry, children: [] };
    let parent = stack.at(-1);
    while (parent && parent.entry.level >= entry.level) {
      stack.pop();
      parent = stack.at(-1);
    }
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  }

  return roots;
}

export interface OutlineSource {
  contentFormat?: string | null;
  contentJson: unknown;
  /** Header dek — some renderers drop a leading heading that repeats it. */
  description?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveFormat(source: OutlineSource): string | null {
  if (source.contentFormat) return source.contentFormat;
  if (isRecord(source.contentJson)) {
    const type = source.contentJson.$type;
    if (typeof type === "string") return type;
  }
  return null;
}

const RENDERER_CORE_FORMATS = new Set<string>([
  STANDARD_MARKDOWN_CONTENT,
  MARKPUB_MARKDOWN,
  ...ALT_MARKDOWN_FORMATS,
]);
const HTML_FORMATS = new Set<string>(HTML_CONTENT_FORMATS);
const STRUCTURED_FORMATS = new Set<string>(STRUCTURED_BLOCK_FORMATS);

type RawHeading = { level?: number; text: string };

function leafletHeadings(content: unknown): Array<RawHeading> {
  // Canvas blocks are positioned freely, so their array order isn't reading
  // order — leave them out of the outline (`HeadingBlockView` skips them too).
  return leafletBlocks(content).flatMap((block) =>
    block.kind === "header" && !block.canvas
      ? [{ level: block.block.level, text: block.block.plaintext }]
      : [],
  );
}

function pcktHeadings(
  content: unknown,
  description: string | null | undefined,
): Array<RawHeading> {
  const blocks = pcktBlocks(content);
  // Mirrors `PcktContentRenderer`, which drops a leading heading that repeats
  // the header dek.
  const rendered = pcktLeadingHeadingMatchesDescription(content, description)
    ? blocks.slice(1)
    : blocks;
  return rendered.flatMap((block) =>
    block.kind === "heading"
      ? [{ level: block.block.level, text: block.block.plaintext }]
      : [],
  );
}

function structuredHeadings(
  blocks: ReturnType<typeof offprintBlocks> | null,
): Array<RawHeading> {
  return (blocks ?? []).flatMap((block) =>
    block.kind === "heading"
      ? [{ level: block.level, text: block.text.plaintext }]
      : [],
  );
}

function rendererCoreHeadings(
  source: OutlineSource,
  format: string,
): Array<RawHeading> {
  // Same call `StandardDocumentRenderer` makes, so the leading-heading trim
  // (`description`) lines up with what renders.
  const tree = buildRenderTree({
    content: source.contentJson,
    contentFormat: format,
    description: source.description,
  });
  return (tree?.children ?? []).flatMap((node) =>
    node.type === "heading"
      ? [{ level: node.level, text: node.text.plaintext }]
      : [],
  );
}

interface HastLike {
  type: string;
  tagName?: string;
  value?: string;
  children?: Array<HastLike>;
}

/** Concatenated text of a hast subtree (`hast-util-to-string` semantics). */
export function hastText(node: HastLike): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map((child) => hastText(child)).join("");
}

const HEADING_TAG = /^h([1-6])$/;

function htmlHeadings(content: unknown): Array<RawHeading> {
  const html = htmlContentBody(content);
  if (!html) return [];
  // Sanitized with the article schema, as `MarkdownArticle` does, so a heading
  // the sanitizer would strip never reaches the outline.
  const processor = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeSanitize, articleMarkdownSanitizeSchema);
  const tree = processor.runSync(processor.parse(html)) as HastLike;

  const headings: Array<RawHeading> = [];
  const visit = (node: HastLike) => {
    const match =
      node.type === "element" && HEADING_TAG.exec(node.tagName ?? "");
    if (match) {
      headings.push({ level: Number(match[1]), text: hastText(node) });
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return headings;
}

/**
 * Dispatch on format with the same precedence as `CONTENT_RENDERERS`
 * (`renderers/index.ts`): its later registrations overwrite earlier ones, so
 * the checks below run in reverse registration order.
 */
function rawHeadings(source: OutlineSource): Array<RawHeading> {
  const format = resolveFormat(source);
  if (!format) return [];
  const { contentJson: content } = source;

  if (format === MOCHOTT_ARTICLE) return rendererCoreHeadings(source, format);
  if (STRUCTURED_FORMATS.has(format)) {
    return structuredHeadings(structuredFormatBlocks(content));
  }
  if (HTML_FORMATS.has(format)) return htmlHeadings(content);
  if (RENDERER_CORE_FORMATS.has(format)) {
    return rendererCoreHeadings(source, format);
  }
  if (format === LEAFLET_CONTENT) return leafletHeadings(content);
  if (format === LEAFLET_DOCUMENT_FORMAT) {
    return leafletHeadings(leafletDocumentContent(content));
  }
  if (format === PCKT_CONTENT) return pcktHeadings(content, source.description);
  if (format === OFFPRINT_CONTENT) {
    return structuredHeadings(offprintBlocks(content));
  }
  // No renderer claims it: the plaintext fallback has no headings.
  return [];
}

/**
 * The heading outline of an article body, for any content format the reader
 * renders. Never throws — a body the parser can't read just has no outline.
 */
export function articleHeadingOutline(
  source: OutlineSource,
): Array<HeadingOutlineEntry> {
  try {
    return buildHeadingOutline(rawHeadings(source));
  } catch {
    return [];
  }
}
