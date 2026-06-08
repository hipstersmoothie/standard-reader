import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import type { StructuredRenderableBlock } from "#/lib/document/structured-content/types";
import type {
  LeafletListItem,
  LeafletRenderableBlock,
} from "#/lib/leaflet/types";
import type { PcktRenderableBlock } from "#/lib/pckt/types";

import { parseArticleBlocks } from "#/lib/document/blocks";
import { markdownPlaintext } from "#/lib/document/structured-content/markdown";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { asTextBlock, leafletBlocks } from "#/lib/leaflet/blocks";
import { LEAFLET_BLOCK, LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { offprintBlocks } from "#/lib/offprint/blocks";
import { OFFPRINT_CONTENT } from "#/lib/offprint/types";
import { pcktBlocks } from "#/lib/pckt/blocks";
import { PCKT_BLOCK, PCKT_CONTENT } from "#/lib/pckt/types";

export interface QuoteHighlightRange {
  start: number;
  end: number;
}

type ArticleBodyFields = Pick<
  ArticleDetail,
  "textContent" | "contentJson" | "contentFormat"
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function resolveContentType(article: ArticleBodyFields): string | null {
  if (article.contentFormat) return article.contentFormat;
  if (
    isRecord(article.contentJson) &&
    typeof article.contentJson.$type === "string"
  ) {
    return article.contentJson.$type;
  }
  return null;
}

function appendText(parts: Array<string>, text: string | undefined | null) {
  if (text) parts.push(text);
}

/** Find quote boundaries in a flat plain-text stream (matches DOM text node order). */
export function findQuoteTextRange(
  fullText: string,
  quote: string,
): QuoteHighlightRange | null {
  const trimmed = quote.trim();
  if (!trimmed || !fullText) return null;

  const directIndex = fullText.indexOf(trimmed);
  if (directIndex !== -1) {
    return { start: directIndex, end: directIndex + trimmed.length };
  }

  const pattern = trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => escapeRegExp(part))
    .join(String.raw`\s+`);
  const match = new RegExp(pattern, "i").exec(fullText);
  if (!match || match.index === undefined) return null;

  return { start: match.index, end: match.index + match[0].length };
}

function isLeafletListItem(value: unknown): value is LeafletListItem {
  return isRecord(value);
}

function appendLeafletListItemText(
  item: LeafletListItem,
  parts: Array<string>,
) {
  const text = asTextBlock(item.content);
  appendText(parts, text?.plaintext);

  if (item.children?.length) {
    appendLeafletListItems(item.children, parts);
  }

  const unordered = item.unorderedListChildren;
  if (
    isRecord(unordered) &&
    unordered.$type === LEAFLET_BLOCK.unorderedList &&
    Array.isArray(unordered.children)
  ) {
    appendLeafletListItems(unordered.children as Array<LeafletListItem>, parts);
  }

  const ordered = item.orderedListChildren;
  if (
    isRecord(ordered) &&
    ordered.$type === LEAFLET_BLOCK.orderedList &&
    Array.isArray(ordered.children)
  ) {
    appendLeafletListItems(ordered.children as Array<LeafletListItem>, parts);
  }
}

function appendLeafletListItems(
  items: Array<LeafletListItem>,
  parts: Array<string>,
) {
  for (const item of items) {
    if (!isLeafletListItem(item)) continue;
    const text = asTextBlock(item.content);
    const hasNested =
      (item.children?.length ?? 0) > 0 ||
      (isRecord(item.unorderedListChildren) &&
        Array.isArray(item.unorderedListChildren.children)) ||
      (isRecord(item.orderedListChildren) &&
        Array.isArray(item.orderedListChildren.children));
    if (!text?.plaintext.trim() && !hasNested) continue;
    appendLeafletListItemText(item, parts);
  }
}

function appendLeafletRenderedText(
  block: LeafletRenderableBlock,
  parts: Array<string>,
) {
  switch (block.kind) {
    case "text":
    case "header":
    case "blockquote": {
      appendText(parts, block.block.plaintext);
      return;
    }
    case "unorderedList":
    case "orderedList": {
      appendLeafletListItems(block.block.children ?? [], parts);
      return;
    }
    case "code": {
      appendText(parts, block.block.plaintext);
      return;
    }
    case "horizontalRule":
    case "bskyPost":
    case "image":
    case "iframe":
    case "unknown": {
      return;
    }
  }
}

function appendPcktListContent(
  content: Array<Record<string, unknown>> | undefined,
  parts: Array<string>,
) {
  if (!content?.length) return;

  for (const entry of content) {
    const text = asTextBlock(entry);
    if (text?.plaintext.trim()) {
      appendText(parts, text.plaintext);
      continue;
    }

    if (!isRecord(entry) || typeof entry.$type !== "string") continue;

    if (entry.$type === PCKT_BLOCK.bulletList) {
      for (const child of (entry.content as Array<Record<string, unknown>>) ??
        []) {
        if (!isRecord(child)) continue;
        appendPcktListContent(
          child.content as Array<Record<string, unknown>> | undefined,
          parts,
        );
      }
      continue;
    }

    if (entry.$type === PCKT_BLOCK.orderedList) {
      for (const child of (entry.content as Array<Record<string, unknown>>) ??
        []) {
        if (!isRecord(child)) continue;
        appendPcktListContent(
          child.content as Array<Record<string, unknown>> | undefined,
          parts,
        );
      }
      continue;
    }

    if (entry.$type === PCKT_BLOCK.taskList) {
      for (const child of (entry.content as Array<Record<string, unknown>>) ??
        []) {
        if (!isRecord(child)) continue;
        appendPcktListContent(
          child.content as Array<Record<string, unknown>> | undefined,
          parts,
        );
      }
    }
  }
}

function appendPcktRenderedText(
  block: PcktRenderableBlock,
  parts: Array<string>,
) {
  switch (block.kind) {
    case "text":
    case "heading": {
      appendText(parts, block.block.plaintext);
      return;
    }
    case "blockquote": {
      for (const entry of block.block.content ?? []) {
        if (!isRecord(entry)) continue;
        appendPcktListContent(
          entry.content as Array<Record<string, unknown>> | undefined,
          parts,
        );
      }
      return;
    }
    case "bulletList":
    case "orderedList":
    case "taskList": {
      for (const child of block.block.content ?? []) {
        if (!isRecord(child)) continue;
        appendPcktListContent(
          child.content as Array<Record<string, unknown>> | undefined,
          parts,
        );
      }
      return;
    }
    case "code": {
      appendText(parts, block.block.plaintext);
      return;
    }
    case "table": {
      for (const row of block.block.content ?? []) {
        if (!isRecord(row)) continue;
        for (const cell of (row.content as Array<Record<string, unknown>>) ??
          []) {
          if (!isRecord(cell)) continue;
          appendPcktListContent(
            cell.content as Array<Record<string, unknown>> | undefined,
            parts,
          );
        }
      }
      return;
    }
    case "website": {
      appendText(parts, block.block.title);
      appendText(parts, block.block.description);
      return;
    }
    case "horizontalRule":
    case "blueskyEmbed":
    case "image":
    case "iframe":
    case "unknown": {
      return;
    }
  }
}

function appendStructuredRenderedText(
  block: StructuredRenderableBlock,
  parts: Array<string>,
) {
  switch (block.kind) {
    case "text":
    case "heading":
    case "callout": {
      appendText(parts, block.text.plaintext);
      return;
    }
    case "blockquote": {
      for (const child of block.blocks) {
        appendStructuredRenderedText(child, parts);
      }
      return;
    }
    case "bulletList":
    case "orderedList": {
      for (const item of block.items) {
        appendText(parts, item.plaintext);
      }
      return;
    }
    case "taskList": {
      for (const item of block.items) {
        appendText(parts, item.text.plaintext);
      }
      return;
    }
    case "code": {
      appendText(parts, block.plaintext);
      return;
    }
    case "website": {
      appendText(parts, block.title);
      appendText(parts, block.description);
      return;
    }
    case "table": {
      for (const row of block.rows) {
        for (const cell of row) {
          appendText(parts, cell.text.plaintext);
        }
      }
      return;
    }
    case "horizontalRule":
    case "blueskyEmbed":
    case "image":
    case "iframe":
    case "unknown": {
      return;
    }
  }
}

function fallbackRenderedPlainText(article: ArticleBodyFields): string {
  const blocks = parseArticleBlocks({
    textContent: article.textContent,
    contentJson: article.contentJson,
  });
  return blocks.map((block) => block.text).join("");
}

/** Plain text in the same order as rendered DOM text nodes (no block separators). */
export function articleRenderedPlainText(article: ArticleBodyFields): string {
  const contentType = resolveContentType(article);
  const parts: Array<string> = [];

  if (contentType === LEAFLET_CONTENT) {
    for (const block of leafletBlocks(article.contentJson)) {
      appendLeafletRenderedText(block, parts);
    }
    return parts.join("");
  }

  if (contentType === PCKT_CONTENT) {
    for (const block of pcktBlocks(article.contentJson)) {
      appendPcktRenderedText(block, parts);
    }
    return parts.join("");
  }

  if (contentType === OFFPRINT_CONTENT) {
    for (const block of offprintBlocks(article.contentJson)) {
      appendStructuredRenderedText(block, parts);
    }
    return parts.join("");
  }

  if (contentType === STANDARD_MARKDOWN_CONTENT) {
    return markdownPlaintext(article.contentJson) ?? "";
  }

  return fallbackRenderedPlainText(article);
}

export function resolveQuoteHighlightRange(
  article: ArticleBodyFields,
  quote: string | null | undefined,
): QuoteHighlightRange | null {
  if (!quote?.trim()) return null;
  const plainText = articleRenderedPlainText(article);
  if (!plainText) return null;
  return findQuoteTextRange(plainText, quote);
}
