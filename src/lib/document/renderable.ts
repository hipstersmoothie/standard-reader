import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";

import { parseArticleBlocks } from "#/lib/document/blocks";
import {
  LEAFLET_DOCUMENT_FORMAT,
  altMarkdownText,
  htmlContentBody,
  leafletDocumentContent,
  structuredFormatBlocks,
} from "#/lib/document/content-formats";
import { markdownPlaintext } from "#/lib/document/structured-content/markdown";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { leafletBlocks } from "#/lib/leaflet/blocks";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { offprintBlocks } from "#/lib/offprint/blocks";
import { OFFPRINT_CONTENT } from "#/lib/offprint/types";
import { pcktBlocks } from "#/lib/pckt/blocks";
import { PCKT_CONTENT } from "#/lib/pckt/types";

/** Minimal body fields needed to decide whether a document renders in-app. */
export interface ArticleBodyFields {
  textContent?: string | null;
  contentJson: JsonValue | unknown;
  contentFormat?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

/**
 * True when the reader can render structured in-app body content (leaflet
 * blocks or JSON blocks). Plain `textContent` and document-level `bskyPostUri`
 * do not count — those articles open on the publication site.
 *
 * Kept framework-free (no React imports) so it can run at ingest/backfill time
 * as well as in the reader UI.
 */
export function hasRenderableArticleBody(article: ArticleBodyFields): boolean {
  const contentType = resolveContentType(article);
  if (contentType === LEAFLET_CONTENT) {
    return leafletBlocks(article.contentJson).length > 0;
  }
  if (contentType === PCKT_CONTENT) {
    return pcktBlocks(article.contentJson).length > 0;
  }
  if (contentType === OFFPRINT_CONTENT) {
    return offprintBlocks(article.contentJson).length > 0;
  }
  if (contentType === STANDARD_MARKDOWN_CONTENT) {
    return Boolean(markdownPlaintext(article.contentJson));
  }
  if (contentType === LEAFLET_DOCUMENT_FORMAT) {
    return (
      leafletBlocks(leafletDocumentContent(article.contentJson)).length > 0
    );
  }

  const structured = structuredFormatBlocks(article.contentJson, contentType);
  if (structured) return structured.length > 0;
  if (altMarkdownText(article.contentJson, contentType)) return true;
  if (htmlContentBody(article.contentJson, contentType)) return true;

  const blocks = parseArticleBlocks({
    textContent: null,
    contentJson: article.contentJson as JsonValue,
  });
  return blocks.length > 0;
}
