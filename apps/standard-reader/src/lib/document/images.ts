/**
 * Every image a document's body renders, in reading order.
 *
 * `lead-image.ts` answers "what is this article's hero?" and stops at the first
 * block. This module answers "what are this document's pages?" — the comic
 * reader flips through exactly this list, and `recomputeSerialKinds` counts it
 * to tell a comic serial apart from a prose one.
 *
 * Every format is walked through the same block parsers the renderers use, so
 * the page list matches what the article view would have drawn. Formats whose
 * body is markdown or HTML fall back to scanning the markup for image tags.
 */

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import {
  LEAFLET_DOCUMENT_FORMAT,
  leafletDocumentContent,
  structuredFormatBlocks,
} from "#/lib/document/content-formats";
import { altMarkdownText } from "#/lib/document/structured-content/alt-markdown";
import { htmlContentBody } from "#/lib/document/structured-content/html";
import {
  normalizeImageAlt,
  structuredImageAspectRatio,
  structuredImageHasSource,
  structuredImageUrl,
} from "#/lib/document/structured-content/image";
import { markdownPlaintext } from "#/lib/document/structured-content/markdown";
import type { StructuredRenderableBlock } from "#/lib/document/structured-content/types";
import { leafletBlocks } from "#/lib/leaflet/blocks";
import { leafletImageAspectRatio, leafletImageUrl } from "#/lib/leaflet/image";
import type { LeafletRenderableBlock } from "#/lib/leaflet/types";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { prepareMarkpubMarkdown } from "#/lib/markpub/markdown";
import { offprintBlocks } from "#/lib/offprint/blocks";
import { OFFPRINT_CONTENT } from "#/lib/offprint/types";
import { pcktBlocks } from "#/lib/pckt/blocks";
import {
  pcktImageAlt,
  pcktImageAspectRatio,
  pcktImageHasSource,
  pcktImageUrl,
} from "#/lib/pckt/image";
import { PCKT_CONTENT } from "#/lib/pckt/types";

/** One rendered image from a document body. */
export interface DocumentImage {
  url: string;
  /** Alt text, `""` when the record carries none. */
  alt: string;
  /** Width ÷ height; falls back to 16∶9 when the record omits dimensions. */
  aspectRatio: number;
}

/** The subset of a document a page list can be derived from. */
export type ImageSourceDocument = Pick<
  ArticleDetail,
  "contentFormat" | "contentJson" | "did"
>;

const DEFAULT_ASPECT_RATIO = 16 / 9;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveContentType(article: ImageSourceDocument): string | null {
  if (article.contentFormat) return article.contentFormat;
  if (
    isRecord(article.contentJson) &&
    typeof article.contentJson.$type === "string"
  ) {
    return article.contentJson.$type;
  }
  return null;
}

function pushLeafletImages(
  blocks: Array<LeafletRenderableBlock>,
  did: string,
  out: Array<DocumentImage>,
): void {
  for (const entry of blocks) {
    if (entry.kind === "image") {
      const url = leafletImageUrl(entry.block, did);
      if (url) {
        out.push({
          url,
          alt: normalizeImageAlt(entry.block.alt),
          aspectRatio: leafletImageAspectRatio(entry.block),
        });
      }
      continue;
    }
    if (entry.kind === "imageGallery") {
      for (const image of entry.block.images ?? []) {
        const url = leafletImageUrl(image, did);
        if (!url) continue;
        out.push({
          url,
          alt: normalizeImageAlt(image.alt),
          aspectRatio: leafletImageAspectRatio(image),
        });
      }
      continue;
    }
    // A referenced page renders inline, so its images are pages here too.
    if (entry.kind === "pageEmbed") {
      pushLeafletImages(entry.blocks, did, out);
    }
  }
}

function pushStructuredImages(
  blocks: Array<StructuredRenderableBlock>,
  did: string,
  out: Array<DocumentImage>,
): void {
  for (const block of blocks) {
    if (block.kind === "image") {
      if (!structuredImageHasSource(block)) continue;
      const url = structuredImageUrl(block, did);
      if (!url) continue;
      out.push({
        url,
        alt: normalizeImageAlt(block.alt, block.caption),
        aspectRatio: structuredImageAspectRatio(block),
      });
      continue;
    }
    if (block.kind === "imageGrid" || block.kind === "imageCarousel") {
      for (const image of block.images) {
        if (!structuredImageHasSource(image)) continue;
        const url = structuredImageUrl(image, did);
        if (!url) continue;
        out.push({
          url,
          alt: normalizeImageAlt(image.alt),
          aspectRatio: structuredImageAspectRatio(image),
        });
      }
      continue;
    }
    if (block.kind === "blockquote") {
      pushStructuredImages(block.blocks, did, out);
    }
  }
}

// `![alt](url "title")` — the URL stops at whitespace or the closing paren.
const MARKDOWN_IMAGE = /!\[([^\]]*)]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
// A bare `<img>` tag; `alt` may sit before or after `src`.
const HTML_IMAGE = /<img\b[^>]*>/gi;
const HTML_IMAGE_SRC = /\bsrc=["']([^"']+)["']/i;
const HTML_IMAGE_ALT = /\balt=["']([^"']*)["']/i;

/** Images in a markdown or HTML body, in document order. */
export function markupImages(text: string): Array<DocumentImage> {
  const out: Array<DocumentImage> = [];

  for (const match of text.matchAll(MARKDOWN_IMAGE)) {
    const url = match[2]?.trim();
    if (!url) continue;
    out.push({
      url,
      alt: normalizeImageAlt(match[1]),
      aspectRatio: DEFAULT_ASPECT_RATIO,
    });
  }

  for (const match of text.matchAll(HTML_IMAGE)) {
    const url = match[0].match(HTML_IMAGE_SRC)?.[1]?.trim();
    if (!url) continue;
    out.push({
      url,
      alt: normalizeImageAlt(match[0].match(HTML_IMAGE_ALT)?.[1]),
      aspectRatio: DEFAULT_ASPECT_RATIO,
    });
  }

  return out;
}

/**
 * Every image the document body renders, in reading order.
 *
 * Deduplicated by URL: a document that opens with its cover image and repeats it
 * later shouldn't page through the same art twice, and the markdown/HTML
 * fallback scans the same body with two patterns.
 */
export function documentImages(
  article: ImageSourceDocument,
): Array<DocumentImage> {
  const contentType = resolveContentType(article);
  const { contentJson, did } = article;
  if (!contentType || !contentJson) return [];

  const images: Array<DocumentImage> = [];

  if (
    contentType === LEAFLET_CONTENT ||
    contentType === LEAFLET_DOCUMENT_FORMAT
  ) {
    const content =
      contentType === LEAFLET_DOCUMENT_FORMAT
        ? leafletDocumentContent(contentJson)
        : contentJson;
    pushLeafletImages(leafletBlocks(content), did, images);
  } else if (contentType === PCKT_CONTENT) {
    for (const entry of pcktBlocks(contentJson)) {
      if (entry.kind !== "image" || !pcktImageHasSource(entry.block)) continue;
      const url = pcktImageUrl(entry.block, did);
      if (!url) continue;
      images.push({
        url,
        alt: pcktImageAlt(entry.block),
        aspectRatio: pcktImageAspectRatio(entry.block),
      });
    }
  } else if (contentType === OFFPRINT_CONTENT) {
    pushStructuredImages(offprintBlocks(contentJson), did, images);
  } else {
    const structured = structuredFormatBlocks(contentJson, contentType);
    if (structured) {
      pushStructuredImages(structured, did, images);
    } else {
      const markup =
        markdownPlaintext(contentJson) ??
        altMarkdownText(contentJson) ??
        prepareMarkpubMarkdown(contentJson)?.body ??
        htmlContentBody(contentJson);
      if (markup) images.push(...markupImages(markup));
    }
  }

  const seen = new Set<string>();
  return images.filter((image) => {
    if (seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}
