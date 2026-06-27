import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import {
  LEAFLET_DOCUMENT_FORMAT,
  leafletDocumentContent,
  structuredFormatBlocks,
} from "#/lib/document/content-formats";
import { altMarkdownText } from "#/lib/document/structured-content/alt-markdown";
import { htmlContentBody } from "#/lib/document/structured-content/html";
import {
  structuredImageHasSource,
  structuredImageUrl,
} from "#/lib/document/structured-content/image";
import { markdownPlaintext } from "#/lib/document/structured-content/markdown";
import { leafletBlocks } from "#/lib/leaflet/blocks";
import { leafletImageUrl } from "#/lib/leaflet/image";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { prepareMarkpubMarkdown } from "#/lib/markpub/markdown";
import { offprintBlocks } from "#/lib/offprint/blocks";
import { OFFPRINT_CONTENT } from "#/lib/offprint/types";
import { pcktBlocks } from "#/lib/pckt/blocks";
import { pcktImageHasSource, pcktImageUrl } from "#/lib/pckt/image";
import { PCKT_CONTENT } from "#/lib/pckt/types";

export type ArticleHeroImage = {
  url: string;
  /** True when the hero comes from the article's first content block. */
  fromFirstBlock: boolean;
};

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

const LEADING_MARKDOWN_IMAGE =
  /^\s*(?:<!--[\s\S]*?-->\s*)*!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*/;

const LEADING_HTML_IMG =
  /^\s*(?:<!--[\s\S]*?-->\s*)*<img[^>]+src=["']([^"']+)["'][^>]*>\s*/i;

/** First image URL in markdown/HTML when it opens the document body. */
export function leadingMarkupImageUrl(text: string): string | null {
  const markdown = text.match(LEADING_MARKDOWN_IMAGE);
  if (markdown?.[1]) return markdown[1];

  const html = text.match(LEADING_HTML_IMG);
  if (html?.[1]) return html[1];

  return null;
}

/** Strip a leading markdown/HTML image so the hero is not duplicated in the body. */
export function stripLeadingMarkupImage(text: string): string {
  return text
    .replace(LEADING_MARKDOWN_IMAGE, "")
    .replace(LEADING_HTML_IMG, "")
    .trimStart();
}

function firstBlockImageUrl(
  article: Pick<ArticleDetail, "contentFormat" | "contentJson" | "did">,
): string | null {
  const contentType = resolveContentType(article);
  const { contentJson, did } = article;
  if (!contentType || !contentJson) return null;

  if (
    contentType === LEAFLET_CONTENT ||
    contentType === LEAFLET_DOCUMENT_FORMAT
  ) {
    const content =
      contentType === LEAFLET_DOCUMENT_FORMAT
        ? leafletDocumentContent(contentJson)
        : contentJson;
    const first = leafletBlocks(content)[0];
    if (first?.kind === "image") {
      return leafletImageUrl(first.block, did);
    }
    return null;
  }

  if (contentType === PCKT_CONTENT) {
    const first = pcktBlocks(contentJson)[0];
    if (first?.kind === "image" && pcktImageHasSource(first.block)) {
      return pcktImageUrl(first.block, did);
    }
    return null;
  }

  if (contentType === OFFPRINT_CONTENT) {
    const first = offprintBlocks(contentJson)[0];
    if (first?.kind === "image" && structuredImageHasSource(first)) {
      return structuredImageUrl(first, did);
    }
    return null;
  }

  const structured = structuredFormatBlocks(contentJson, contentType);
  if (structured?.[0]?.kind === "image") {
    const first = structured[0];
    if (structuredImageHasSource(first)) {
      return structuredImageUrl(first, did);
    }
  }

  const markdown =
    markdownPlaintext(contentJson) ??
    altMarkdownText(contentJson) ??
    prepareMarkpubMarkdown(contentJson)?.body ??
    htmlContentBody(contentJson);
  if (markdown) return leadingMarkupImageUrl(markdown);

  return null;
}

/**
 * Hero image for an article header: a leading content image wins over the
 * document's explicit cover image.
 */
export function resolveArticleHeroImage(
  article: Pick<
    ArticleDetail,
    "coverImageUrl" | "contentFormat" | "contentJson" | "did"
  >,
): ArticleHeroImage | null {
  const fromFirstBlock = firstBlockImageUrl(article);
  if (fromFirstBlock) {
    return { url: fromFirstBlock, fromFirstBlock: true };
  }
  if (article.coverImageUrl) {
    return { url: article.coverImageUrl, fromFirstBlock: false };
  }
  return null;
}
