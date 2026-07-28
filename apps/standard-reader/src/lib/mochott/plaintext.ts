/**
 * Plaintext + renderability for a mochott body, for the paths that need text
 * rather than components: search indexing, the `has_renderable_body` flag, and
 * the page reader.
 *
 * The blocks come from `@standard-reader/renderer-core` — the same parse the
 * reading view renders — so what search finds and what a reader sees can't
 * drift. (The app's own `StructuredRenderableBlock` union is an older, narrower
 * copy, hence the local walk instead of routing through
 * `structuredFormatBlocks`.)
 */

import type { StructuredRenderableBlock } from "@standard-reader/renderer-core";
import { mochottBlocks } from "@standard-reader/renderer-core";

import { MOCHOTT_ARTICLE } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Renderable blocks for a stored mochott body. */
export function mochottRenderableBlocks(
  content: unknown,
  contentFormat?: string | null,
): Array<StructuredRenderableBlock> {
  return mochottBlocks(content, contentFormat ?? MOCHOTT_ARTICLE) ?? [];
}

function blockLines(block: StructuredRenderableBlock): Array<string> {
  switch (block.kind) {
    case "text":
    case "heading":
    case "callout": {
      return [block.text.plaintext];
    }
    case "blockquote": {
      return block.blocks.flatMap((nested) => blockLines(nested));
    }
    case "bulletList":
    case "orderedList": {
      return block.items.flatMap((item) => [
        item.text.plaintext,
        ...(item.children ?? []).flatMap((child) => blockLines(child)),
      ]);
    }
    case "taskList": {
      return block.items.map((item) => item.text.plaintext);
    }
    case "code": {
      return [block.plaintext];
    }
    case "table": {
      return block.rows.map((row) =>
        row.map((cell) => cell.text.plaintext).join(" "),
      );
    }
    case "image": {
      // The caption is authored prose (mochott puts the description there);
      // alt is usually empty.
      return [block.caption, block.alt].filter(
        (value): value is string => typeof value === "string",
      );
    }
    case "website": {
      return [block.title, block.description].filter(
        (value): value is string => typeof value === "string",
      );
    }
    default: {
      return [];
    }
  }
}

/**
 * Plaintext for a mochott body. The record carries its own `textContent` (the
 * lexicon's field for "text-only consumers"), which is preferred when present;
 * otherwise it is walked out of the parsed blocks.
 */
export function mochottPlaintext(
  content: unknown,
  contentFormat?: string | null,
): string {
  const blocks = mochottRenderableBlocks(content, contentFormat);
  if (blocks.length === 0) return "";

  const recordText =
    isRecord(content) && typeof content.textContent === "string"
      ? content.textContent.trim()
      : "";
  if (recordText) return recordText;

  return blocks
    .flatMap((block) => blockLines(block))
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
