/**
 * Parser for `items[]`-of-typed-blocks content formats that follow the
 * `<ns>.block.*` naming convention — currently `is.logue.content` and
 * `blog.afterword.content`. Both use leaflet-style byte facets, which the
 * shared faceted-text renderer already understands.
 */
import type { StructuredRenderableBlock, StructuredText } from "./types";

import { mergeTextRuns } from "./text-runs";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Known namespaced item formats: content `$type` → block `$type` prefix. */
const ITEM_BLOCK_NAMESPACES: Record<string, string> = {
  "blog.afterword.content": "blog.afterword.block",
  "is.logue.content": "is.logue.block",
};

export const ITEM_BLOCK_FORMATS = Object.keys(ITEM_BLOCK_NAMESPACES);

export function isItemBlockFormat(format: string | null | undefined) {
  return Boolean(format && format in ITEM_BLOCK_NAMESPACES);
}

function structuredText(value: Record<string, unknown>): StructuredText | null {
  if (typeof value.plaintext !== "string") return null;
  return {
    facets: Array.isArray(value.facets) ? value.facets : undefined,
    plaintext: value.plaintext,
  };
}

/** Merge a list item's `content` (array of text runs) into one StructuredText. */
function listItemText(item: unknown, ns: string): StructuredText | null {
  if (!isRecord(item)) return null;
  if (item.$type !== `${ns}.listItem`) return null;
  const runs = Array.isArray(item.content) ? item.content : [];
  const texts = runs.flatMap((run) => {
    if (!isRecord(run) || run.$type !== `${ns}.text`) return [];
    const text = structuredText(run);
    return text ? [text] : [];
  });
  if (texts.length === 0) return null;
  const merged = mergeTextRuns(texts);
  return merged.plaintext.trim() ? merged : null;
}

function listItems(value: Record<string, unknown>, ns: string) {
  const children = Array.isArray(value.content) ? value.content : [];
  return children.flatMap((child) => {
    const text = listItemText(child, ns);
    return text ? [text] : [];
  });
}

function asBlock(value: unknown, ns: string): StructuredRenderableBlock | null {
  if (!isRecord(value) || typeof value.$type !== "string") return null;
  const kind = value.$type.startsWith(`${ns}.`)
    ? value.$type.slice(ns.length + 1)
    : null;

  switch (kind) {
    case "text": {
      const text = structuredText(value);
      return text ? { kind: "text", text } : null;
    }
    case "heading": {
      const text = structuredText(value);
      return text
        ? {
            kind: "heading",
            level: typeof value.level === "number" ? value.level : undefined,
            text,
          }
        : null;
    }
    case "blockquote": {
      const text = structuredText(value);
      return text
        ? { blocks: [{ kind: "text", text }], kind: "blockquote" }
        : null;
    }
    case "unorderedList": {
      const items = listItems(value, ns);
      return items.length > 0 ? { items, kind: "bulletList" } : null;
    }
    case "orderedList": {
      const items = listItems(value, ns);
      return items.length > 0
        ? {
            items,
            kind: "orderedList",
            start: typeof value.start === "number" ? value.start : undefined,
          }
        : null;
    }
    case "code": {
      if (typeof value.plaintext !== "string") return null;
      return {
        kind: "code",
        language:
          typeof value.language === "string" ? value.language : undefined,
        plaintext: value.plaintext,
      };
    }
    case "iframe": {
      return typeof value.url === "string"
        ? { kind: "iframe", url: value.url }
        : null;
    }
    case "blueskyEmbed": {
      const ref = value.postRef;
      const uri = isRecord(ref) && typeof ref.uri === "string" ? ref.uri : null;
      return uri ? { kind: "blueskyEmbed", postUri: uri } : null;
    }
    case "image": {
      return {
        alt: typeof value.alt === "string" ? value.alt : undefined,
        blob: value.image,
        kind: "image",
      };
    }
    case "horizontalRule": {
      return { kind: "horizontalRule" };
    }
    default: {
      return { blockType: value.$type, kind: "unknown" };
    }
  }
}

/** Renderable blocks for a namespaced `items[]` content payload. */
export function itemBlocks(
  content: unknown,
  contentFormat?: string | null,
): Array<StructuredRenderableBlock> {
  if (!isRecord(content)) return [];
  const format =
    typeof content.$type === "string" ? content.$type : contentFormat;
  const ns = format ? ITEM_BLOCK_NAMESPACES[format] : undefined;
  if (!ns) return [];
  const items = Array.isArray(content.items) ? content.items : [];

  const result: Array<StructuredRenderableBlock> = [];
  for (const item of items) {
    const block = asBlock(item, ns);
    if (block) result.push(block);
  }
  return result;
}
