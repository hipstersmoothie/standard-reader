/**
 * HTML body for RSS `content:encoded`, dispatched per content format the same
 * way {@link documentExtractedText} dispatches plaintext (`search-text.ts`).
 * Only formats with straightforward text->HTML paths are supported — block
 * formats (leaflet/pckt/offprint/structured) have no HTML-string renderer
 * outside React, so callers fall back to the record `description` excerpt.
 */

import { marked } from "marked";

import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";
import { altMarkdownText } from "#/lib/document/structured-content/alt-markdown";
import { htmlContentBody } from "#/lib/document/structured-content/html";
import { markdownPlaintext } from "#/lib/document/structured-content/markdown";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { prepareMarkpubMarkdown } from "#/lib/markpub/markdown";
import { MARKPUB_MARKDOWN } from "#/lib/markpub/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveContentFormat(
  contentFormat: string | null | undefined,
  contentJson: JsonValue | unknown,
): string | null {
  if (contentFormat) return contentFormat;
  if (isRecord(contentJson) && typeof contentJson.$type === "string") {
    return contentJson.$type;
  }
  return null;
}

/**
 * HTML string for `content:encoded`, or `null` when the format has no HTML
 * (or markdown-to-HTML) path — the caller should fall back to the excerpt.
 */
export function documentContentHtml(
  contentJson: JsonValue | unknown,
  contentFormat?: string | null,
): string | null {
  const format = resolveContentFormat(contentFormat, contentJson);

  const html = htmlContentBody(contentJson, format);
  if (html) return html;

  if (format === STANDARD_MARKDOWN_CONTENT) {
    const markdown = markdownPlaintext(contentJson);
    return markdown ? marked.parse(markdown, { async: false }) : null;
  }

  if (format === MARKPUB_MARKDOWN) {
    const prepared = prepareMarkpubMarkdown(contentJson);
    return prepared ? marked.parse(prepared.body, { async: false }) : null;
  }

  const altMarkdown = altMarkdownText(contentJson, format);
  if (altMarkdown) return marked.parse(altMarkdown, { async: false });

  return null;
}
