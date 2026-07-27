/** Formatting helpers shared by the reader UI (kept apart from components). */

import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import { STANDARD_NSID } from "#/lib/atproto/nsids";

/** Byline author (lead contributor, else publication owner, else publication
 * name). Lives here (not in a component file) so both `article-view.tsx` and
 * `text-selection-toolbar.tsx` can import it without a circular dependency. */
export function primaryAuthor(article: ArticleDetail): string {
  const lead = article.contributors[0];
  if (lead?.displayName) return lead.displayName;
  if (article.publicationOwnerDisplayName) {
    return article.publicationOwnerDisplayName;
  }
  if (lead?.handle) return `@${lead.handle}`;
  if (article.publicationOwnerHandle)
    return `@${article.publicationOwnerHandle}`;
  return article.publication?.name ?? "Unknown author";
}

/** Matches the Postcard prototype (~220 wpm). */
const WORDS_PER_MINUTE = 220;

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Browser-safe stand-in for the `reading-time` package (Node-only). */
function readingStats(text: string): {
  minutes: number;
  text: string;
  words: number;
} {
  const words = countWords(text);
  const minutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
  return { minutes, text: `${minutes} min read`, words };
}

/**
 * Route params (`{ did, rkey }`) for the on-site `/p/$did/$rkey` publication
 * profile, parsed from a publication AT-URI (`at://did/<collection>/rkey`).
 * Returns null for anything that isn't a well-formed record URI so callers can
 * fall back to the publication's external `url`.
 */
export function publicationLinkParams(
  uri: string,
): { did: string; rkey: string } | null {
  if (typeof uri !== "string" || !uri.startsWith("at://")) return null;
  const rest = uri.slice("at://".length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const did = rest.slice(0, slash);
  const after = rest.slice(slash + 1);
  const nextSlash = after.indexOf("/");
  if (nextSlash === -1) return null;
  const rkey = after.slice(nextSlash + 1);
  if (!did.startsWith("did:") || rkey.length === 0) return null;
  return { did, rkey };
}

/** Rebuild a publication AT-URI from its `/p/$did/$rkey` route params. */
export function publicationUriFromParams(did: string, rkey: string): string {
  return `at://${did}/${STANDARD_NSID.publication}/${rkey}`;
}

/**
 * Route params (`{ did, rkey }`) for the on-site `/l/$did/$rkey` list page,
 * parsed from an `app.standard-reader.list` AT-URI.
 */
export function listLinkParams(
  uri: string,
): { did: string; rkey: string } | null {
  return publicationLinkParams(uri);
}

/**
 * Route params (`{ did, rkey }`) for the on-site `/a/$did/$rkey` article view,
 * parsed from a document AT-URI (`at://did/<collection>/rkey`).
 */
export function documentLinkParams(
  uri: string,
): { did: string; rkey: string } | null {
  if (typeof uri !== "string" || !uri.startsWith("at://")) return null;
  const rest = uri.slice("at://".length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const did = rest.slice(0, slash);
  const after = rest.slice(slash + 1);
  const nextSlash = after.indexOf("/");
  if (nextSlash === -1) return null;
  const rkey = after.slice(nextSlash + 1);
  if (!did.startsWith("did:") || rkey.length === 0) return null;
  return { did, rkey };
}

/** Rebuild a document AT-URI from its `/a/$did/$rkey` route params. */
export function documentUriFromParams(did: string, rkey: string): string {
  return `at://${did}/${STANDARD_NSID.document}/${rkey}`;
}

/** Canonical path for the tag directory (`/tag/$tag`). */
export function tagPagePath(tag: string): string {
  return `/tag/${encodeURIComponent(tag)}`;
}

/** Title-case a tag slug for mastheads (`travel` → `Travel`). */
export function tagDisplayTitle(tag: string): string {
  return tag
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Canonical URL for an article on its publication site (indexed or derived). */
export function articlePublicationUrl(article: {
  canonicalUrl: string | null;
  path: string | null;
  publication: { url: string } | null;
}): string | null {
  if (article.canonicalUrl) return article.canonicalUrl;
  const base = article.publication?.url;
  if (!base) return null;
  const trimmed = base.replace(/\/+$/, "");
  if (!article.path) return trimmed;
  const withSlash = article.path.startsWith("/")
    ? article.path
    : `/${article.path}`;
  return `${trimmed}${withSlash}`;
}

/** On-site article path (`/a/$did/$rkey`) when the URI is a document record. */
export function articleReaderPath(documentUri: string): string | null {
  const params = documentLinkParams(documentUri);
  if (!params) return null;
  return `/a/${encodeURIComponent(params.did)}/${encodeURIComponent(params.rkey)}`;
}

/** Absolute Standard Reader article URL for portable/off-platform links. */
export function articleReaderUrl(
  documentUri: string,
  baseUrl: string,
): string | null {
  const path = articleReaderPath(documentUri);
  if (!path) return null;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

/**
 * Destination for a collection newsletter's "Read the piece →" link: the
 * in-app reader when the body is renderable, otherwise the publication site.
 */
export function collectionPieceReadUrl(
  article: {
    uri: string;
    hasRenderableBody: boolean;
    canonicalUrl: string | null;
  },
  baseUrl: string,
): string | null {
  if (article.hasRenderableBody) {
    return articleReaderUrl(article.uri, baseUrl);
  }
  return article.canonicalUrl;
}

/** Estimated minutes from body text; `null` when there is nothing to measure. */
export function readingMinutes(text: string | null | undefined): number | null {
  if (!text?.trim()) return null;
  const stats = readingStats(text);
  if (stats.words === 0) return null;
  return stats.minutes;
}

/** Medium-style label, e.g. `"4 min read"` — `null` when text is missing/empty. */
export function formatReadingTime(
  text: string | null | undefined,
): string | null {
  if (!text?.trim()) return null;
  const stats = readingStats(text);
  if (stats.words === 0) return null;
  return stats.text;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

/**
 * First user-perceived character. Indexing with `[0]` would return half a
 * surrogate pair for emoji/astral names (e.g. "🎌" -> "\ud83c", which renders
 * as tofu).
 */
function firstGrapheme(text: string | undefined): string {
  if (!text) return "";
  for (const { segment } of graphemeSegmenter.segment(text)) return segment;
  return "";
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (firstGrapheme(parts[0]) || "?").toUpperCase();
  return `${firstGrapheme(parts[0])}${firstGrapheme(parts.at(-1))}`.toUpperCase();
}

export function formatReaders(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/** `m:ss` clock time for the page-reader transport. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
