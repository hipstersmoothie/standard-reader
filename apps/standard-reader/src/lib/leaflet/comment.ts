/**
 * Leaflet comments (`pub.leaflet.comment`).
 *
 * Leaflet's comment drawer writes records whose `subject` is the AT-URI of the
 * document being commented on — and for Leaflet-hosted Standard publications
 * that subject is our own `site.standard.document`, so no URL matching is
 * needed. A comment may carry a `#linearDocumentQuote` attachment anchoring it
 * to a character range inside the document's `pub.leaflet.content`.
 */

import { publishingPlatform } from "#/lib/publishing-platform";

import { LEAFLET_CONTENT, LEAFLET_PAGE } from "./types";

export const LEAFLET_COMMENT_COLLECTION = "pub.leaflet.comment";

/** Constellation JSON path for the document a comment is about. */
export const LEAFLET_COMMENT_SUBJECT_PATH = ".subject";

/**
 * Leaflet's comment drawer for a document, which is the closest thing to a
 * permalink — individual comments have no addressable URL.
 *
 * Only meaningful for Leaflet-hosted publications, but "is this Leaflet?" is
 * decided by `publishingPlatform` (content format first, host as the fallback)
 * rather than by sniffing for `leaflet.pub`: Leaflet supports custom domains, so
 * a host-only check left every custom-domain publication's comments with no link
 * at all. Returns null when the document is not Leaflet's or has no URL to open.
 */
export function leafletCommentDrawerUrl(document: {
  canonicalUrl: string | null;
  contentFormat: string | null;
}): string | null {
  const { canonicalUrl, contentFormat } = document;
  if (!canonicalUrl) return null;
  if (publishingPlatform({ contentFormat, canonicalUrl }) !== "leaflet") {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(canonicalUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  parsed.searchParams.set("interactionDrawer", "comments");
  return parsed.toString();
}

interface QuotePosition {
  /** Path of block indices into the page's `blocks` array. */
  block: Array<number>;
  /** Offset in JS string units (NOT UTF-8 bytes, unlike Leaflet facets). */
  offset: number;
}

export interface LeafletCommentQuote {
  document: string;
  start: QuotePosition;
  end: QuotePosition;
}

export interface LeafletComment {
  uri: string;
  did: string;
  rkey: string;
  subject: string;
  plaintext: string;
  facets: Array<unknown> | null;
  createdAt: string;
  /** AT-URI of the parent comment, when this is a threaded reply. */
  parentUri: string | null;
  quote: LeafletCommentQuote | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asQuotePosition(value: unknown): QuotePosition | null {
  if (!isRecord(value)) return null;
  if (typeof value.offset !== "number" || !Number.isFinite(value.offset)) {
    return null;
  }
  if (!Array.isArray(value.block)) return null;
  const block = value.block.filter(
    (index): index is number => typeof index === "number" && index >= 0,
  );
  if (block.length !== value.block.length || block.length === 0) return null;
  return { block, offset: Math.max(0, Math.trunc(value.offset)) };
}

function asQuote(value: unknown): LeafletCommentQuote | null {
  if (!isRecord(value)) return null;
  if (value.$type !== `${LEAFLET_COMMENT_COLLECTION}#linearDocumentQuote`) {
    return null;
  }
  if (typeof value.document !== "string") return null;
  if (!isRecord(value.quote)) return null;

  const start = asQuotePosition(value.quote.start);
  const end = asQuotePosition(value.quote.end);
  if (!start || !end) return null;

  return { document: value.document, start, end };
}

/** Validate and normalize a raw `pub.leaflet.comment` record. */
export function normalizeLeafletComment(
  uri: string,
  did: string,
  rkey: string,
  value: unknown,
): LeafletComment | null {
  if (!isRecord(value)) return null;
  if (value.$type !== LEAFLET_COMMENT_COLLECTION) return null;
  if (typeof value.subject !== "string" || !value.subject.startsWith("at://")) {
    return null;
  }
  if (typeof value.plaintext !== "string") return null;
  if (typeof value.createdAt !== "string") return null;

  const parent = isRecord(value.reply) ? value.reply.parent : null;

  return {
    uri,
    did,
    rkey,
    subject: value.subject,
    plaintext: value.plaintext,
    facets:
      Array.isArray(value.facets) && value.facets.length > 0
        ? value.facets
        : null,
    createdAt: value.createdAt,
    parentUri: typeof parent === "string" ? parent : null,
    quote: asQuote(value.attachment),
  };
}

function unwrapBlock(entry: unknown): Record<string, unknown> | null {
  if (!isRecord(entry)) return null;
  if (
    entry.$type === LEAFLET_PAGE.linearDocumentBlock ||
    entry.$type === LEAFLET_PAGE.canvasBlock
  ) {
    return isRecord(entry.block) ? entry.block : null;
  }
  return isRecord(entry.block) ? entry.block : entry;
}

/**
 * Resolve a block path against a page's `blocks` array.
 *
 * Paths index the *raw* record structure, so this deliberately walks
 * `content.pages[].blocks` rather than `leafletBlocks()` — the latter resolves
 * and flattens page embeds, which shifts every index.
 */
function blockAtPath(
  blocks: unknown,
  path: Array<number>,
): Record<string, unknown> | null {
  if (!Array.isArray(blocks)) return null;

  const [index, ...rest] = path;
  const entry = blocks[index];
  if (entry === undefined) return null;

  const block = unwrapBlock(entry);
  if (!block) return null;
  if (rest.length === 0) return block;

  // Nested paths address blocks inside an embedded page, or list items
  // inside a `pub.leaflet.blocks.unorderedList` / `orderedList` container —
  // those keep their items under `children`, not `blocks`.
  const nested = Array.isArray(block.blocks) ? block.blocks : block.children;
  return blockAtPath(nested, rest);
}

function blockPlaintext(block: Record<string, unknown> | null): string | null {
  if (!block) return null;
  if (typeof block.plaintext === "string") return block.plaintext;
  // List items carry their text on `content` rather than directly on the item.
  if (isRecord(block.content) && typeof block.content.plaintext === "string") {
    return block.content.plaintext;
  }
  return null;
}

function rootBlocks(content: unknown): unknown {
  if (!isRecord(content)) return null;
  if (content.$type !== LEAFLET_CONTENT) return null;
  if (!Array.isArray(content.pages)) return null;
  const page = content.pages.find(
    (candidate) =>
      isRecord(candidate) && candidate.$type === LEAFLET_PAGE.linearDocument,
  );
  return isRecord(page) ? page.blocks : null;
}

const MAX_QUOTE_LENGTH = 600;

/**
 * The document text a comment's quote anchor selects, or null when the anchor
 * can't be resolved (non-Leaflet content, edited document, image block, …).
 *
 * Offsets are JS string indices — verified against live records, where byte
 * offsets land mid-word but character offsets land on sentence boundaries.
 */
export function extractLeafletQuoteText(
  content: unknown,
  quote: LeafletCommentQuote,
): string | null {
  const blocks = rootBlocks(content);
  if (!blocks) return null;

  const startText = blockPlaintext(blockAtPath(blocks, quote.start.block));
  if (startText == null) return null;

  const sameBlock =
    quote.start.block.length === quote.end.block.length &&
    quote.start.block.every((index, i) => index === quote.end.block[i]);

  let selected: string;
  if (sameBlock) {
    if (quote.end.offset <= quote.start.offset) return null;
    selected = startText.slice(quote.start.offset, quote.end.offset);
  } else {
    // Multi-block selection: tail of the first block, whole blocks between,
    // then the head of the last. Anything unresolvable is skipped rather than
    // failing the whole quote.
    const endText = blockPlaintext(blockAtPath(blocks, quote.end.block));
    if (endText == null) return null;

    const parts = [startText.slice(quote.start.offset)];

    if (quote.start.block.length === 1 && quote.end.block.length === 1) {
      for (let i = quote.start.block[0] + 1; i < quote.end.block[0]; i += 1) {
        const between = blockPlaintext(blockAtPath(blocks, [i]));
        if (between) parts.push(between);
      }
    }

    parts.push(endText.slice(0, quote.end.offset));
    selected = parts.filter(Boolean).join("\n\n");
  }

  const trimmed = selected.trim();
  if (!trimmed) return null;

  return trimmed.length > MAX_QUOTE_LENGTH
    ? `${trimmed.slice(0, MAX_QUOTE_LENGTH).trimEnd()}…`
    : trimmed;
}
