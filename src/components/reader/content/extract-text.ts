import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";

import { parseArticleBlocks } from "#/lib/document/blocks";
import { markdownPlaintext } from "#/lib/document/structured-content/markdown";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { leafletBskyPostUris } from "#/lib/leaflet/blocks";
import { leafletPlaintext } from "#/lib/leaflet/plaintext";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { offprintPlaintext } from "#/lib/offprint/plaintext";
import { OFFPRINT_CONTENT } from "#/lib/offprint/types";
import { pcktPlaintext } from "#/lib/pckt/plaintext";
import { PCKT_CONTENT } from "#/lib/pckt/types";

// Re-exported so existing reader-UI imports keep working; the implementation
// lives in `#/lib/document/renderable` so it can run at ingest/backfill time.
export { hasRenderableArticleBody } from "#/lib/document/renderable";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveContentType(
  article: Pick<ArticleDetail, "contentFormat" | "contentJson">,
): string | null {
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
 * Whether `article.description` is just an auto-generated excerpt of the body
 * (pckt fills it with the first N characters of the post). Such descriptions
 * shouldn't be narrated — they duplicate the article's opening.
 */
export function articleDescriptionIsBodyExcerpt(
  article: Pick<ArticleDetail, "contentFormat" | "contentJson">,
): boolean {
  return resolveContentType(article) === PCKT_CONTENT;
}

/** AT-URIs of Bluesky posts embedded in the article body (Leaflet only). */
export function articleBskyPostUris(article: ArticleDetail): Array<string> {
  if (resolveContentType(article) !== LEAFLET_CONTENT) return [];
  return leafletBskyPostUris(article.contentJson);
}

/**
 * Best-effort full text for reading-time estimates and search previews.
 * `bskyPostText` optionally inlines narration for embedded Bluesky posts; it's
 * ignored unless the body is rendered from blocks (Leaflet content).
 */
export function articleReadingText(
  article: ArticleDetail,
  bskyPostText?: Map<string, string>,
): string | null {
  const contentType = resolveContentType(article);
  if (contentType === LEAFLET_CONTENT) {
    return leafletPlaintext(article.contentJson, bskyPostText);
  }

  if (article.textContent?.trim()) return article.textContent;
  if (contentType === PCKT_CONTENT) {
    return pcktPlaintext(article.contentJson);
  }
  if (contentType === OFFPRINT_CONTENT) {
    return offprintPlaintext(article.contentJson);
  }
  if (contentType === STANDARD_MARKDOWN_CONTENT) {
    return markdownPlaintext(article.contentJson);
  }

  const blocks = parseArticleBlocks({
    textContent: article.textContent,
    contentJson: article.contentJson,
  });
  if (blocks.length > 0) {
    return blocks.map((block) => block.text).join("\n\n");
  }

  return article.description;
}

/** Author name for narration (lead contributor, else publication owner). */
export function speechAuthor(article: ArticleDetail): string | null {
  const lead = article.contributors[0];
  if (lead?.displayName) return lead.displayName;
  if (article.publicationOwnerDisplayName) {
    return article.publicationOwnerDisplayName;
  }
  if (lead?.handle) return lead.handle;
  if (article.publicationOwnerHandle) return article.publicationOwnerHandle;
  return article.publication?.name ?? null;
}

/**
 * Full narration text for the page reader: title, description, author byline,
 * then the body content (each separated so the TTS pauses between them).
 * Auto-excerpt descriptions (pckt) are skipped — they'd read the opening twice.
 * `bskyPostText` optionally inlines narration for embedded Bluesky posts.
 */
export function articleSpeechText(
  article: ArticleDetail,
  bskyPostText?: Map<string, string>,
): string | null {
  const parts: Array<string> = [];

  if (article.title?.trim()) parts.push(article.title.trim());
  if (!articleDescriptionIsBodyExcerpt(article) && article.description?.trim()) {
    parts.push(article.description.trim());
  }

  const author = speechAuthor(article);
  if (author) parts.push(`By ${author}.`);

  const content = articleReadingText(article, bskyPostText)?.trim();
  if (content) parts.push(content);

  return parts.length > 0 ? parts.join("\n\n") : null;
}

/** Reading-time input for feed cards (full body when indexed, else dek). */
export function articleCardReadingText(
  article: Pick<ArticleCard, "textContent" | "description">,
): string | null {
  if (article.textContent?.trim()) return article.textContent;
  return article.description;
}
