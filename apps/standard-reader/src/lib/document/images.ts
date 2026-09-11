/**
 * Every image a document's body renders, in reading order.
 *
 * `lead-image.ts` answers "what is this article's hero?" and stops at the first
 * block. This module answers "what are this document's pages?" — the comic
 * reader flips through exactly this list, and `recomputeSerialKinds` reads it
 * to tell a comic serial apart from a prose one.
 *
 * The same walk also counts how many blocks the body renders in total
 * ({@link documentBody}), because the image list on its own cannot say whether
 * the art *is* the post or merely sits inside it — a conference newsletter
 * announcing a sponsor has one logo and twenty blocks of prose, and looks
 * exactly like a comic page to anything that only counts images.
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

/**
 * A document body, measured the way the comic classifier reads it.
 */
export interface DocumentBody {
  /** Every image the body renders, in reading order, deduplicated by URL. */
  images: Array<DocumentImage>;
  /**
   * Renderable blocks in the body — art, paragraphs, headings, embeds, rules.
   *
   * A comic page is one or two of these (the page, and maybe the author's note
   * under it). An article that carries an illustration is a dozen or more. That
   * difference is the only thing that separates the two, since both post short
   * text and at least one image.
   */
  blockCount: number;
}

/** A body under construction, before its images are deduplicated. */
interface BodyAccumulator {
  images: Array<DocumentImage>;
  blocks: number;
}

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

function pushLeafletBlocks(
  blocks: Array<LeafletRenderableBlock>,
  did: string,
  out: BodyAccumulator,
): void {
  for (const entry of blocks) {
    // A referenced page renders inline, so its images are pages here too — and
    // its blocks are this body's blocks. The embed itself draws nothing, so it
    // is not counted on top of what it expands to.
    if (entry.kind === "pageEmbed") {
      pushLeafletBlocks(entry.blocks, did, out);
      continue;
    }

    out.blocks += 1;

    if (entry.kind === "image") {
      const url = leafletImageUrl(entry.block, did);
      if (url) {
        out.images.push({
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
        out.images.push({
          url,
          alt: normalizeImageAlt(image.alt),
          aspectRatio: leafletImageAspectRatio(image),
        });
      }
    }
  }
}

function pushStructuredBlocks(
  blocks: Array<StructuredRenderableBlock>,
  did: string,
  out: BodyAccumulator,
): void {
  for (const block of blocks) {
    // A quote is a wrapper around the blocks it holds; those are what render.
    if (block.kind === "blockquote") {
      pushStructuredBlocks(block.blocks, did, out);
      continue;
    }

    out.blocks += 1;

    if (block.kind === "image") {
      if (!structuredImageHasSource(block)) continue;
      const url = structuredImageUrl(block, did);
      if (!url) continue;
      out.images.push({
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
        out.images.push({
          url,
          alt: normalizeImageAlt(image.alt),
          aspectRatio: structuredImageAspectRatio(image),
        });
      }
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

/** Paragraph boundary in a markdown or HTML body — a blank line. */
const MARKUP_PARAGRAPH_BREAK = /\n{2,}/;

/**
 * Blocks a markdown or HTML body renders, for formats with no block structure
 * to walk. The images are already known; what is left is counted as the prose
 * around them, one block per paragraph.
 */
function markupProseBlocks(markup: string): number {
  return markup
    .replaceAll(MARKDOWN_IMAGE, "")
    .replaceAll(HTML_IMAGE, "")
    .split(MARKUP_PARAGRAPH_BREAK)
    .filter((paragraph) => paragraph.trim()).length;
}

/** Drop repeats of an image already in the list, keeping the first. */
function dedupeByUrl(images: Array<DocumentImage>): Array<DocumentImage> {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

/**
 * The document body's art and its bulk, in one walk.
 *
 * Images are deduplicated by URL: a document that opens with its cover image and
 * repeats it later shouldn't page through the same art twice, and the
 * markdown/HTML fallback scans the same body with two patterns.
 */
export function documentBody(article: ImageSourceDocument): DocumentBody {
  const contentType = resolveContentType(article);
  const { contentJson, did } = article;
  if (!contentType || !contentJson) return { images: [], blockCount: 0 };

  const out: BodyAccumulator = { images: [], blocks: 0 };

  if (
    contentType === LEAFLET_CONTENT ||
    contentType === LEAFLET_DOCUMENT_FORMAT
  ) {
    const content =
      contentType === LEAFLET_DOCUMENT_FORMAT
        ? leafletDocumentContent(contentJson)
        : contentJson;
    pushLeafletBlocks(leafletBlocks(content), did, out);
  } else if (contentType === PCKT_CONTENT) {
    for (const entry of pcktBlocks(contentJson)) {
      out.blocks += 1;
      if (entry.kind !== "image" || !pcktImageHasSource(entry.block)) continue;
      const url = pcktImageUrl(entry.block, did);
      if (!url) continue;
      out.images.push({
        url,
        alt: pcktImageAlt(entry.block),
        aspectRatio: pcktImageAspectRatio(entry.block),
      });
    }
  } else if (contentType === OFFPRINT_CONTENT) {
    pushStructuredBlocks(offprintBlocks(contentJson), did, out);
  } else {
    const structured = structuredFormatBlocks(contentJson, contentType);
    if (structured) {
      pushStructuredBlocks(structured, did, out);
    } else {
      const markup =
        markdownPlaintext(contentJson) ??
        altMarkdownText(contentJson) ??
        prepareMarkpubMarkdown(contentJson)?.body ??
        htmlContentBody(contentJson);
      if (markup) {
        // Deduplicated here rather than at the end, so the two patterns finding
        // the same image can't be counted as two blocks of art.
        const found = dedupeByUrl(markupImages(markup));
        out.images.push(...found);
        out.blocks += found.length + markupProseBlocks(markup);
      }
    }
  }

  return { images: dedupeByUrl(out.images), blockCount: out.blocks };
}

/** Every image the document body renders, in reading order. */
export function documentImages(
  article: ImageSourceDocument,
): Array<DocumentImage> {
  return documentBody(article).images;
}
