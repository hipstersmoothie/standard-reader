import type {
  StructuredRenderableBlock,
  StructuredText,
} from "#/lib/document/structured-content/types";

import { normalizeImageAlt } from "#/lib/document/structured-content/image";

import { OFFPRINT_BLOCK, OFFPRINT_CONTENT } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): StructuredText | null {
  if (!isRecord(value)) return null;
  if (value.$type !== OFFPRINT_BLOCK.text) return null;
  if (typeof value.plaintext !== "string") return null;
  return {
    plaintext: value.plaintext,
    facets: Array.isArray(value.facets) ? value.facets : undefined,
  };
}

function listItemsFromChildren(children: unknown): Array<StructuredText> {
  if (!Array.isArray(children)) return [];
  const items: Array<StructuredText> = [];
  for (const child of children) {
    if (!isRecord(child)) continue;
    const text = asText(child.content);
    if (text?.plaintext.trim()) items.push(text);
  }
  return items;
}

function blockquoteBlocks(content: unknown): Array<StructuredRenderableBlock> {
  if (!Array.isArray(content)) return [];
  const blocks: Array<StructuredRenderableBlock> = [];
  for (const entry of content) {
    const parsed = asRenderableBlock(entry);
    if (parsed) blocks.push(parsed);
  }
  return blocks;
}

function asRenderableBlock(value: unknown): StructuredRenderableBlock | null {
  if (!isRecord(value)) return null;

  const text = asText(value);
  if (text) return { kind: "text", text };

  if (value.$type === OFFPRINT_BLOCK.heading) {
    if (typeof value.plaintext !== "string") return null;
    return {
      kind: "heading",
      level: typeof value.level === "number" ? value.level : undefined,
      text: {
        plaintext: value.plaintext,
        facets: Array.isArray(value.facets) ? value.facets : undefined,
      },
    };
  }

  if (value.$type === OFFPRINT_BLOCK.blockquote) {
    const blocks = blockquoteBlocks(value.content);
    return blocks.length > 0 ? { kind: "blockquote", blocks } : null;
  }

  if (value.$type === OFFPRINT_BLOCK.callout) {
    if (typeof value.plaintext !== "string" || !value.plaintext.trim()) {
      return null;
    }
    return {
      kind: "callout",
      text: {
        plaintext: value.plaintext,
        facets: Array.isArray(value.facets) ? value.facets : undefined,
      },
      emoji: typeof value.emoji === "string" ? value.emoji : undefined,
      color: typeof value.color === "string" ? value.color : undefined,
    };
  }

  if (value.$type === OFFPRINT_BLOCK.bulletList) {
    const items = listItemsFromChildren(value.children);
    return items.length > 0 ? { kind: "bulletList", items } : null;
  }

  if (value.$type === OFFPRINT_BLOCK.orderedList) {
    const items = listItemsFromChildren(value.children);
    return items.length > 0
      ? {
          kind: "orderedList",
          start: typeof value.start === "number" ? value.start : undefined,
          items,
        }
      : null;
  }

  if (value.$type === OFFPRINT_BLOCK.taskList) {
    const children = value.children;
    if (!Array.isArray(children)) return null;
    const items = children.flatMap((child) => {
      if (!isRecord(child)) return [];
      const itemText = asText(child.content);
      if (!itemText?.plaintext.trim()) return [];
      return [
        {
          checked: child.checked === true,
          text: itemText,
        },
      ];
    });
    return items.length > 0 ? { kind: "taskList", items } : null;
  }

  if (value.$type === OFFPRINT_BLOCK.image) {
    return {
      kind: "image",
      blob: value.image,
      alt:
        normalizeImageAlt(
          typeof value.alt === "string" ? value.alt : undefined,
        ) || undefined,
      aspectRatio: isRecord(value.aspectRatio)
        ? {
            width:
              typeof value.aspectRatio.width === "number"
                ? value.aspectRatio.width
                : undefined,
            height:
              typeof value.aspectRatio.height === "number"
                ? value.aspectRatio.height
                : undefined,
          }
        : undefined,
    };
  }

  if (value.$type === OFFPRINT_BLOCK.codeBlock) {
    const plaintext =
      typeof value.code === "string"
        ? value.code
        : typeof value.plaintext === "string"
          ? value.plaintext
          : null;
    if (!plaintext) return null;
    return {
      kind: "code",
      plaintext,
      language: typeof value.language === "string" ? value.language : undefined,
    };
  }

  if (value.$type === OFFPRINT_BLOCK.blueskyPost) {
    const post = value.post;
    const uri =
      isRecord(post) && typeof post.uri === "string" ? post.uri : null;
    return uri ? { kind: "blueskyEmbed", postUri: uri } : null;
  }

  if (value.$type === OFFPRINT_BLOCK.webEmbed) {
    const url =
      typeof value.embedUrl === "string"
        ? value.embedUrl
        : typeof value.url === "string"
          ? value.url
          : null;
    return url
      ? {
          kind: "iframe",
          url,
          height:
            typeof value.embedHeight === "number"
              ? value.embedHeight
              : undefined,
        }
      : null;
  }

  if (value.$type === OFFPRINT_BLOCK.webBookmark) {
    const src = typeof value.href === "string" ? value.href : null;
    if (!src) return null;
    return {
      kind: "website",
      src,
      title: typeof value.title === "string" ? value.title : undefined,
      description:
        typeof value.description === "string" ? value.description : undefined,
      previewImage: typeof value.image === "string" ? value.image : undefined,
    };
  }

  if (value.$type === OFFPRINT_BLOCK.horizontalRule) {
    return { kind: "horizontalRule" };
  }

  const blockType =
    typeof value.$type === "string" ? value.$type : "unknown block";
  return { kind: "unknown", blockType };
}

export function offprintBlocks(
  content: unknown,
): Array<StructuredRenderableBlock> {
  if (!isRecord(content)) return [];
  if (content.$type !== OFFPRINT_CONTENT) return [];
  const items = content.items;
  if (!Array.isArray(items)) return [];

  const result: Array<StructuredRenderableBlock> = [];
  for (const item of items) {
    const parsed = asRenderableBlock(item);
    if (parsed) result.push(parsed);
  }
  return result;
}
