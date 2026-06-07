import { getPublicUrlClient } from "#/lib/public-url";

/** Max quote length stored for share links / Bluesky compose. */
export const MAX_QUOTE_SHARE_LENGTH = 500;

const textEncoder =
  globalThis.TextEncoder === undefined ? null : new TextEncoder();

function base64UrlToBytes(encoded: string): Uint8Array | null {
  try {
    const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    if (typeof atob === "function") {
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.codePointAt(i) ?? 0;
      }
      return bytes;
    }
    return new Uint8Array(Buffer.from(padded, "base64"));
  } catch {
    return null;
  }
}

/** Normalize selected text before matching or display. */
export function normalizeQuoteText(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

/** Legacy: decode an inline base64 `q` param back to quote text. */
export function decodeQuoteParam(encoded: string | undefined): string | null {
  if (!encoded?.trim()) return null;
  if (!textEncoder) return normalizeQuoteText(encoded) || null;
  const bytes = base64UrlToBytes(encoded.trim());
  if (!bytes) return null;
  const decoded = new TextDecoder().decode(bytes);
  const normalized = normalizeQuoteText(decoded);
  return normalized || null;
}

export function articleSharePath(did: string, rkey: string): string {
  return `/a/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`;
}

/** Share URL for a highlighted quote on an article. */
export function buildQuoteShareUrl(
  did: string,
  rkey: string,
  shareId: string,
  baseUrl = getPublicUrlClient(),
): string {
  const url = new URL(articleSharePath(did, rkey), baseUrl);
  url.searchParams.set("q", shareId);
  return url.toString();
}

/** OG image URL for a quote card (social previews). */
export function buildQuoteOgImageUrl(
  did: string,
  rkey: string,
  shareId: string,
  baseUrl = getPublicUrlClient(),
): string {
  const url = new URL("/api/og/quote", baseUrl);
  url.searchParams.set("did", did);
  url.searchParams.set("rkey", rkey);
  url.searchParams.set("q", shareId);
  return url.toString();
}

export function truncateQuoteForDisplay(text: string, max = 220): string {
  const normalized = normalizeQuoteText(text);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

/** Bluesky post limit (Unicode grapheme clusters). */
export const BSKY_COMPOSE_MAX_GRAPHEMES = 300;

const BSKY_COMPOSE_URL = "https://bsky.app/intent/compose";

function graphemeSegmenter(): Intl.Segmenter | null {
  if (globalThis.Intl?.Segmenter === undefined) return null;
  return new Intl.Segmenter(undefined, { granularity: "grapheme" });
}

function graphemeCount(text: string): number {
  const segmenter = graphemeSegmenter();
  if (!segmenter) return text.length;
  return [...segmenter.segment(text)].length;
}

function truncateGraphemes(text: string, max: number): string {
  if (max <= 0) return "";
  const segmenter = graphemeSegmenter();
  if (!segmenter) return text.slice(0, max);

  const segments = [...segmenter.segment(text)].map((part) => part.segment);
  if (segments.length <= max) return text;
  if (max === 1) return "…";
  return `${segments.slice(0, max - 1).join("")}…`;
}

/**
 * Bluesky compose intent URL pre-filled with a single link (e.g. our quote-share URL).
 * The link card / OG preview carries the quote; the post body stays empty for commentary.
 * @see https://docs.bsky.app/docs/advanced-guides/intent-links
 */
export function buildBlueskyComposeUrl(linkUrl: string): string {
  const draft = truncateGraphemes(linkUrl.trim(), BSKY_COMPOSE_MAX_GRAPHEMES);
  const url = new URL(BSKY_COMPOSE_URL);
  url.searchParams.set("text", draft);
  return url.toString();
}

/**
 * @deprecated Prefer {@link buildBlueskyComposeUrl} with an app quote-share URL only.
 * Legacy helper that inlined the excerpt in the post body.
 */
export function buildBlueskyQuoteComposeUrl(
  quote: string,
  shareUrl: string,
): string {
  const normalized = normalizeQuoteText(quote);
  const suffix = normalized ? `\n\n${shareUrl}` : shareUrl;
  const maxQuoteGraphemes =
    BSKY_COMPOSE_MAX_GRAPHEMES - graphemeCount(suffix) - 2;
  const excerpt =
    maxQuoteGraphemes > 0
      ? truncateGraphemes(normalized, maxQuoteGraphemes)
      : "";
  const text = excerpt ? `"${excerpt}"${suffix}` : shareUrl;
  const draft = truncateGraphemes(text, BSKY_COMPOSE_MAX_GRAPHEMES);

  const url = new URL(BSKY_COMPOSE_URL);
  url.searchParams.set("text", draft);
  return url.toString();
}
