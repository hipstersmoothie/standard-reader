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

// A leading `<img>` wrapped in a `<figure>` (optionally with a `<figcaption>`
// and/or a link) — WordPress/Gutenberg `wp-block-image` and similar emit this,
// so the bare-`<img>` pattern below never sees the tag it expects.
const LEADING_HTML_FIGURE =
  /^\s*(?:<!--[\s\S]*?-->\s*)*<figure\b[^>]*>\s*(?:<a\b[^>]*>\s*)?<img[^>]+src=["']([^"']+)["'][\s\S]*?<\/figure>\s*/i;

// A bare leading `<img>`, optionally wrapped in a link.
const LEADING_HTML_IMG =
  /^\s*(?:<!--[\s\S]*?-->\s*)*(?:<a\b[^>]*>\s*)?<img[^>]+src=["']([^"']+)["'][^>]*>\s*(?:<\/a>\s*)?/i;

/** First image URL in markdown/HTML when it opens the document body. */
export function leadingMarkupImageUrl(text: string): string | null {
  const markdown = text.match(LEADING_MARKDOWN_IMAGE);
  if (markdown?.[1]) return markdown[1];

  const figure = text.match(LEADING_HTML_FIGURE);
  if (figure?.[1]) return figure[1];

  const html = text.match(LEADING_HTML_IMG);
  if (html?.[1]) return html[1];

  return null;
}

/** Strip a leading markdown/HTML image so the hero is not duplicated in the body. */
export function stripLeadingMarkupImage(text: string): string {
  return text
    .replace(LEADING_MARKDOWN_IMAGE, "")
    .replace(LEADING_HTML_FIGURE, "")
    .replace(LEADING_HTML_IMG, "")
    .trimStart();
}

/** An image that opens the body, with its width ÷ height when the record says. */
type LeadingImage = { url: string; aspectRatio: number | null };

/**
 * The hero frame is a fixed 16∶9 box that crops with `object-fit: cover`, and a
 * promoted image is removed from the body. So an image only moves up when the
 * frame shows (nearly) all of it: at 1.6 the crop loses under a tenth of the
 * height. A square or portrait photo would lose most of itself, and the
 * reader would never see the whole picture.
 */
const MIN_PROMOTED_ASPECT_RATIO = 1.6;

function aspectRatioOf(
  dimensions: { width?: unknown; height?: unknown } | null | undefined,
): number | null {
  const width = dimensions?.width;
  const height = dimensions?.height;
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0
  ) {
    return width / height;
  }
  return null;
}

function leadingImage(
  url: string | null,
  aspectRatio: number | null,
): LeadingImage | null {
  return url ? { url, aspectRatio } : null;
}

function firstBlockImage(
  article: Pick<ArticleDetail, "contentFormat" | "contentJson" | "did">,
): LeadingImage | null {
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
      return leadingImage(
        leafletImageUrl(first.block, did),
        aspectRatioOf(first.block.aspectRatio),
      );
    }
    return null;
  }

  if (contentType === PCKT_CONTENT) {
    const first = pcktBlocks(contentJson)[0];
    if (first?.kind === "image" && pcktImageHasSource(first.block)) {
      const attrs = first.block.attrs;
      return leadingImage(
        pcktImageUrl(first.block, did),
        aspectRatioOf(attrs?.aspectRatio) ??
          aspectRatioOf({
            width: attrs?.naturalWidth,
            height: attrs?.naturalHeight,
          }),
      );
    }
    return null;
  }

  if (contentType === OFFPRINT_CONTENT) {
    const first = offprintBlocks(contentJson)[0];
    if (first?.kind === "image" && structuredImageHasSource(first)) {
      return leadingImage(
        structuredImageUrl(first, did),
        aspectRatioOf(first.aspectRatio),
      );
    }
    return null;
  }

  const structured = structuredFormatBlocks(contentJson, contentType);
  if (structured?.[0]?.kind === "image") {
    const first = structured[0];
    if (structuredImageHasSource(first)) {
      return leadingImage(
        structuredImageUrl(first, did),
        aspectRatioOf(first.aspectRatio),
      );
    }
  }

  const markdown =
    markdownPlaintext(contentJson) ??
    altMarkdownText(contentJson) ??
    prepareMarkpubMarkdown(contentJson)?.body ??
    htmlContentBody(contentJson);
  // Markup images carry no dimensions, so their shape is unknown.
  if (markdown) return leadingImage(leadingMarkupImageUrl(markdown), null);

  return null;
}

/** Unknown shapes keep the old behaviour: markup images have no dimensions. */
function fitsHeroFrame(image: LeadingImage): boolean {
  return (
    image.aspectRatio === null || image.aspectRatio >= MIN_PROMOTED_ASPECT_RATIO
  );
}

const BLOB_CID_IN_URL = /\/(baf[a-z2-7]{20,})(?:@[a-z]+)?(?:[?#]|$)/;

/** Same picture: the same blob CID, whatever CDN size or format suffix. */
function isSameImage(a: string, b: string): boolean {
  if (a === b) return true;
  const cidA = a.match(BLOB_CID_IN_URL)?.[1];
  return cidA !== undefined && cidA === b.match(BLOB_CID_IN_URL)?.[1];
}

/**
 * Hero image for an article header: a leading content image wins over the
 * document's explicit cover image, as long as the 16∶9 frame can show it
 * whole. A square or portrait lead stays in the body at full size, and the
 * cover (often the author's own crop of it) takes the header instead. When the
 * cover is that same picture there is no hero, so it does not appear twice.
 */
export function resolveArticleHeroImage(
  article: Pick<
    ArticleDetail,
    "coverImageUrl" | "contentFormat" | "contentJson" | "did"
  >,
): ArticleHeroImage | null {
  const lead = firstBlockImage(article);
  if (lead && fitsHeroFrame(lead)) {
    return { url: lead.url, fromFirstBlock: true };
  }
  const cover = article.coverImageUrl;
  if (cover && !(lead && isSameImage(lead.url, cover))) {
    return { url: cover, fromFirstBlock: false };
  }
  return null;
}
