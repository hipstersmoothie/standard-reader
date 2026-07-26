/**
 * SkyPress (`blog.skypress.content.gutenberg`) — WordPress Gutenberg blocks.
 *
 * A Gutenberg block is `{ name, attributes, innerBlocks }`, where the inline
 * body lives in `attributes.content` as an **HTML fragment** (`<strong>`,
 * `<em>`, `<a href>`, `<code>`, `<br>`, entities).
 *
 * Rather than reassemble that into an HTML string — which would force every
 * framework renderer to ship a sanitizer before it could touch the DOM — the
 * block names map onto the shared {@link StructuredRenderableBlock} vocabulary
 * and the inline HTML is *parsed away* into plaintext plus byte-indexed
 * facets, exactly like the ProseMirror and BlockNote parsers do. No markup
 * survives this module, so there is nothing downstream to sanitize.
 *
 * Blocks whose whole point is arbitrary embedded markup (`core/html`) fall
 * through to their text content; `<script>`/`<style>`/`<template>` subtrees are
 * dropped rather than flattened into visible text.
 */

import { isRecord } from "../../internal";
import { utf8ByteLength } from "../../leaflet/utf8";
import { syntheticFacet } from "./text-runs";
import type { StructuredRenderableBlock, StructuredText } from "./types";

export const GUTENBERG_CONTENT = "blog.skypress.content.gutenberg";

// ---------------------------------------------------------------------------
// Inline HTML → plaintext + facets
// ---------------------------------------------------------------------------

/** Inline tags that carry a formatting mark, keyed to its facet suffix. */
const INLINE_MARKS: Record<string, string> = {
  b: "bold",
  code: "code",
  del: "strikethrough",
  em: "italic",
  i: "italic",
  ins: "underline",
  kbd: "code",
  mark: "highlight",
  s: "strikethrough",
  strike: "strikethrough",
  strong: "bold",
  u: "underline",
};

/** Tags that never have a closing partner, so they must not open a frame. */
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeEntities(text: string): string {
  return text.replaceAll(
    /&(#x?[\da-f]+|[a-z]+);/gi,
    (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      if (entity.startsWith("#")) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

/** Strip comments and non-content subtrees before any tag walking. */
function stripNonContent(html: string): string {
  return html
    .replaceAll(/<(script|style|template)\b[\S\s]*?<\/\1>/gi, "")
    .replaceAll(/<!--[\S\s]*?-->/g, "");
}

const ATTR_PATTERN = String.raw`("([^"]*)"|'([^']*)'|([^\s"'>]+))`;

function attrValue(attrs: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*${ATTR_PATTERN}`, "i").exec(
    attrs,
  );
  if (!match) return undefined;
  const raw = match[2] ?? match[3] ?? match[4];
  const value = raw ? decodeEntities(raw).trim() : "";
  return value || undefined;
}

interface InlineRun {
  text: string;
  /** Facet suffix kinds (`bold`, `italic`, `code`, …). */
  kinds: Array<string>;
  link?: string;
}

/** An open element, remembering what it added so the close tag can undo it. */
interface OpenTag {
  tag: string;
  kind?: string;
  href?: string;
}

const TAG_PATTERN = /<(\/?)([a-z][\da-z]*)\b((?:"[^"]*"|'[^']*'|[^>])*?)\/?>/gi;

/** Flatten an inline HTML fragment into styled runs. */
function collectInlineRuns(html: string): Array<InlineRun> {
  const runs: Array<InlineRun> = [];
  const openKinds: Array<string> = [];
  const openLinks: Array<string> = [];
  const stack: Array<OpenTag> = [];
  const source = stripNonContent(html);

  const push = (text: string) => {
    if (!text) return;
    runs.push({ kinds: [...openKinds], link: openLinks.at(-1), text });
  };

  const pattern = new RegExp(TAG_PATTERN.source, TAG_PATTERN.flags);
  let cursor = 0;
  let match = pattern.exec(source);
  while (match !== null) {
    push(decodeEntities(source.slice(cursor, match.index)));
    cursor = pattern.lastIndex;

    const tag = (match[2] ?? "").toLowerCase();
    if (match[1] === "/") {
      closeTag(tag, stack, openKinds, openLinks);
    } else if (tag === "br") {
      push("\n");
    } else if (!VOID_TAGS.has(tag)) {
      const kind = INLINE_MARKS[tag];
      const href = tag === "a" ? attrValue(match[3] ?? "", "href") : undefined;
      if (kind) openKinds.push(kind);
      if (href) openLinks.push(href);
      stack.push({ href, kind, tag });
    }

    match = pattern.exec(source);
  }
  push(decodeEntities(source.slice(cursor)));

  return runs;
}

/** Unwind to the most recent matching open tag (unbalanced closers ignored). */
function closeTag(
  tag: string,
  stack: Array<OpenTag>,
  openKinds: Array<string>,
  openLinks: Array<string>,
): void {
  const index = stack.findLastIndex((frame) => frame.tag === tag);
  if (index === -1) return;
  for (const frame of stack.slice(index)) {
    if (frame.kind) {
      const at = openKinds.lastIndexOf(frame.kind);
      if (at !== -1) openKinds.splice(at, 1);
    }
    if (frame.href) {
      const at = openLinks.lastIndexOf(frame.href);
      if (at !== -1) openLinks.splice(at, 1);
    }
  }
  stack.length = index;
}

/** Rich text for a Gutenberg inline HTML fragment. */
export function gutenbergInlineText(html: string): StructuredText {
  let plaintext = "";
  const facets: Array<unknown> = [];
  for (const run of collectInlineRuns(html)) {
    const byteStart = utf8ByteLength(plaintext);
    plaintext += run.text;
    const facet = syntheticFacet(
      byteStart,
      utf8ByteLength(plaintext),
      run.kinds,
      run.link,
    );
    if (facet) facets.push(facet);
  }
  return facets.length > 0 ? { facets, plaintext } : { plaintext };
}

/** Plaintext only — for code blocks, where marks would be meaningless. */
function gutenbergPlaintext(html: string): string {
  return collectInlineRuns(html)
    .map((run) => run.text)
    .join("");
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function attributesOf(block: Record<string, unknown>): Record<string, unknown> {
  return isRecord(block.attributes) ? block.attributes : {};
}

function childrenOf(
  block: Record<string, unknown>,
): Array<Record<string, unknown>> {
  return Array.isArray(block.innerBlocks)
    ? block.innerBlocks.filter((child) => isRecord(child))
    : [];
}

function stringAttr(attributes: Record<string, unknown>, key: string): string {
  const value = attributes[key];
  return typeof value === "string" ? value : "";
}

function textBlock(html: string): Array<StructuredRenderableBlock> {
  const text = gutenbergInlineText(html);
  return text.plaintext.trim() ? [{ kind: "text", text }] : [];
}

/** `<li>…</li>` items from the legacy `core/list` `values` attribute. */
function legacyListItems(values: string): Array<StructuredText> {
  return [...values.matchAll(/<li\b[^>]*>([\S\s]*?)<\/li>/gi)]
    .map((match) => gutenbergInlineText(match[1] ?? ""))
    .filter((text) => text.plaintext.trim());
}

function listBlock(
  block: Record<string, unknown>,
): Array<StructuredRenderableBlock> {
  const attributes = attributesOf(block);
  const items = childrenOf(block)
    .filter((child) => child.name === "core/list-item")
    .map((child) =>
      gutenbergInlineText(stringAttr(attributesOf(child), "content")),
    )
    .filter((text) => text.plaintext.trim());
  const resolved =
    items.length > 0
      ? items
      : legacyListItems(stringAttr(attributes, "values"));
  if (resolved.length === 0) return [];

  if (attributes.ordered === true) {
    const start = attributes.start;
    return [
      {
        items: resolved,
        kind: "orderedList",
        start: typeof start === "number" ? start : undefined,
      },
    ];
  }
  return [{ items: resolved, kind: "bulletList" }];
}

function quoteBlock(
  block: Record<string, unknown>,
  content: string,
): Array<StructuredRenderableBlock> {
  const attributes = attributesOf(block);
  const inner = childrenOf(block).flatMap((child) => gutenbergBlock(child));
  const blocks =
    inner.length > 0
      ? inner
      : textBlock(content || stringAttr(attributes, "value"));
  return blocks.length > 0 ? [{ blocks, kind: "blockquote" }] : [];
}

function imageBlock(
  attributes: Record<string, unknown>,
): Array<StructuredRenderableBlock> {
  const url = stringAttr(attributes, "url").trim();
  if (!url) return [];
  const caption = gutenbergInlineText(
    stringAttr(attributes, "caption"),
  ).plaintext.trim();
  const alt = stringAttr(attributes, "alt").trim();
  return [
    {
      alt: alt || undefined,
      caption: caption || undefined,
      externalSrc: url,
      kind: "image",
    },
  ];
}

function headingLevel(attributes: Record<string, unknown>): number {
  const level = attributes.level;
  return typeof level === "number" && level >= 1 && level <= 6 ? level : 2;
}

/** Map one Gutenberg block (and its children) onto the shared vocabulary. */
function gutenbergBlock(
  block: Record<string, unknown>,
): Array<StructuredRenderableBlock> {
  const name = typeof block.name === "string" ? block.name : "";
  const attributes = attributesOf(block);
  const content = stringAttr(attributes, "content");

  switch (name) {
    case "core/paragraph":
    case "core/list-item": {
      return textBlock(content);
    }
    case "core/heading": {
      const text = gutenbergInlineText(content);
      return text.plaintext.trim()
        ? [{ kind: "heading", level: headingLevel(attributes), text }]
        : [];
    }
    case "core/list": {
      return listBlock(block);
    }
    case "core/quote":
    case "core/pullquote": {
      return quoteBlock(block, content);
    }
    case "core/code":
    case "core/preformatted": {
      const plaintext = gutenbergPlaintext(content);
      return plaintext.trim() ? [{ kind: "code", plaintext }] : [];
    }
    case "core/separator": {
      return [{ kind: "horizontalRule" }];
    }
    case "core/image": {
      return imageBlock(attributes);
    }
    case "core/embed": {
      const src = stringAttr(attributes, "url").trim();
      return src ? [{ kind: "website", src }] : [];
    }
    default: {
      // Layout wrappers (group, columns, …) and unknown blocks: keep whatever
      // body they carry rather than dropping the subtree.
      if (content.trim()) return textBlock(content);
      return childrenOf(block).flatMap((child) => gutenbergBlock(child));
    }
  }
}

/**
 * Renderable blocks for a `blog.skypress.content.gutenberg` payload, or null
 * when the format doesn't match or the body is empty. Registered in
 * `STRUCTURED_FORMAT_PARSERS` so `buildRenderTree` handles SkyPress like any
 * other structured format.
 */
export function gutenbergBlocks(
  content: unknown,
  contentFormat?: string | null,
): Array<StructuredRenderableBlock> | null {
  if (!isRecord(content)) return null;
  const format =
    typeof content.$type === "string" ? content.$type : contentFormat;
  if (format !== GUTENBERG_CONTENT) return null;
  const blocks = Array.isArray(content.blocks)
    ? content.blocks.filter((block) => isRecord(block))
    : [];
  const mapped = blocks.flatMap((block) => gutenbergBlock(block));
  return mapped.length > 0 ? mapped : null;
}
