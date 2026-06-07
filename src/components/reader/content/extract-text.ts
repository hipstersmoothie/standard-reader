import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";

import { leafletBlocks } from "#/lib/leaflet/blocks";
import { leafletPlaintext } from "#/lib/leaflet/plaintext";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";

import { parseArticleBlocks } from "#/lib/document/blocks";

type ArticleBodyFields = Pick<
  ArticleDetail,
  "textContent" | "contentJson" | "contentFormat"
>;

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
 */
export function hasRenderableArticleBody(article: ArticleBodyFields): boolean {
  const contentType = resolveContentType(article);
  if (contentType === LEAFLET_CONTENT) {
    return leafletBlocks(article.contentJson).length > 0;
  }

  const blocks = parseArticleBlocks({
    textContent: null,
    contentJson: article.contentJson,
  });
  return blocks.length > 0;
}

/** Best-effort full text for reading-time estimates and search previews. */
export function articleReadingText(article: ArticleDetail): string | null {
  if (article.textContent?.trim()) return article.textContent;

  const contentType = resolveContentType(article);
  if (contentType === LEAFLET_CONTENT) {
    return leafletPlaintext(article.contentJson);
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

/** Reading-time input for feed cards (full body when indexed, else dek). */
export function articleCardReadingText(
  article: Pick<ArticleCard, "textContent" | "description">,
): string | null {
  if (article.textContent?.trim()) return article.textContent;
  return article.description;
}
