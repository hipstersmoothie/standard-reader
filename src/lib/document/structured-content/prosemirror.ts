/**
 * Parser for `com.wss.content.rich-text` — a ProseMirror document under
 * `doc`. Inline marks (bold/italic/code/link) are converted to AT Proto-style
 * byte facets so the shared faceted-text renderer styles them.
 */
import type { StructuredRenderableBlock, StructuredText } from "./types";

import { utf8ByteLength } from "../../leaflet/utf8";
import { mergeTextRuns, syntheticFacet } from "./text-runs";

export const PROSEMIRROR_CONTENT = "com.wss.content.rich-text";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface MarkInfo {
  kinds: Array<string>;
  linkUri?: string;
}

function parseMarks(marks: unknown): MarkInfo {
  const info: MarkInfo = { kinds: [] };
  if (!Array.isArray(marks)) return info;
  for (const mark of marks) {
    if (!isRecord(mark) || typeof mark.type !== "string") continue;
    if (mark.type === "link") {
      const href = typeof mark.href === "string" ? mark.href : null;
      if (href) info.linkUri = href;
      continue;
    }
    // bold / italic / code / strike map onto the facet kinds the renderer
    // recognizes; ProseMirror's "strike" is the renderer's "strikethrough".
    info.kinds.push(mark.type === "strike" ? "strikethrough" : mark.type);
  }
  return info;
}

/** Flatten a node's inline `content` (text runs + marks) into StructuredText. */
function inlineText(node: Record<string, unknown>): StructuredText | null {
  const runs = Array.isArray(node.content) ? node.content : [];
  let plaintext = "";
  const facets: Array<unknown> = [];

  for (const run of runs) {
    if (!isRecord(run)) continue;
    if (run.type === "hardBreak") {
      plaintext += "\n";
      continue;
    }
    if (run.type !== "text" || typeof run.text !== "string") continue;
    const byteStart = utf8ByteLength(plaintext);
    plaintext += run.text;
    const { kinds, linkUri } = parseMarks(run.marks);
    const facet = syntheticFacet(
      byteStart,
      utf8ByteLength(plaintext),
      kinds,
      linkUri,
    );
    if (facet) facets.push(facet);
  }

  if (!plaintext.trim()) return null;
  return facets.length > 0 ? { facets, plaintext } : { plaintext };
}

/** Texts of every paragraph nested under a list item. */
function listItemText(item: unknown): StructuredText | null {
  if (!isRecord(item) || item.type !== "listItem") return null;
  const children = Array.isArray(item.content) ? item.content : [];
  const texts = children.flatMap((child) => {
    if (!isRecord(child) || child.type !== "paragraph") return [];
    const text = inlineText(child);
    return text ? [text] : [];
  });
  if (texts.length === 0) return null;
  if (texts.length === 1) return texts[0];
  // Join multi-paragraph items with newlines, keeping facet offsets aligned.
  const separated = texts.flatMap((text, index) =>
    index === 0 ? [text] : [{ plaintext: "\n" }, text],
  );
  return mergeTextRuns(separated);
}

function asBlock(node: unknown): StructuredRenderableBlock | null {
  if (!isRecord(node) || typeof node.type !== "string") return null;

  switch (node.type) {
    case "paragraph": {
      const text = inlineText(node);
      return text ? { kind: "text", text } : null;
    }
    case "heading": {
      const text = inlineText(node);
      return text
        ? {
            kind: "heading",
            level: typeof node.level === "number" ? node.level : undefined,
            text,
          }
        : null;
    }
    case "bulletList":
    case "orderedList": {
      const children = Array.isArray(node.content) ? node.content : [];
      const items = children.flatMap((child) => {
        const text = listItemText(child);
        return text ? [text] : [];
      });
      if (items.length === 0) return null;
      return node.type === "bulletList"
        ? { items, kind: "bulletList" }
        : { items, kind: "orderedList" };
    }
    case "blockquote": {
      const children = Array.isArray(node.content) ? node.content : [];
      const blocks = children.flatMap((child) => {
        const block = asBlock(child);
        return block ? [block] : [];
      });
      return blocks.length > 0 ? { blocks, kind: "blockquote" } : null;
    }
    case "codeBlock": {
      const text = inlineText(node);
      return text
        ? {
            kind: "code",
            language:
              isRecord(node.attrs) && typeof node.attrs.language === "string"
                ? node.attrs.language
                : undefined,
            plaintext: text.plaintext,
          }
        : null;
    }
    case "embed": {
      // External embed (observed: bsky.app post URLs) — render as a link card.
      return typeof node.url === "string"
        ? { kind: "website", src: node.url }
        : null;
    }
    case "horizontalRule": {
      return { kind: "horizontalRule" };
    }
    case "image": {
      const attrs = isRecord(node.attrs) ? node.attrs : {};
      const src = typeof attrs.src === "string" ? attrs.src : null;
      return src
        ? {
            alt: typeof attrs.alt === "string" ? attrs.alt : undefined,
            externalSrc: src,
            kind: "image",
          }
        : null;
    }
    default: {
      return { blockType: node.type, kind: "unknown" };
    }
  }
}

/** Renderable blocks for a `com.wss.content.rich-text` payload. */
export function prosemirrorBlocks(
  content: unknown,
  contentFormat?: string | null,
): Array<StructuredRenderableBlock> {
  if (!isRecord(content)) return [];
  const format =
    typeof content.$type === "string" ? content.$type : contentFormat;
  if (format !== PROSEMIRROR_CONTENT) return [];
  const doc = content.doc;
  if (!isRecord(doc) || doc.type !== "doc") return [];
  const nodes = Array.isArray(doc.content) ? doc.content : [];

  const result: Array<StructuredRenderableBlock> = [];
  for (const node of nodes) {
    const block = asBlock(node);
    if (block) result.push(block);
  }
  return result;
}
