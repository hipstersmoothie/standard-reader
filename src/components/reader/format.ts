/** Formatting helpers shared by the reader UI (kept apart from components). */

import { STANDARD_NSID } from "#/lib/atproto/nsids";

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

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export function formatReaders(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

/** Article byline meta: read count only (omits zero). Likes use `LikeCount`. */
export function formatArticleReadStats(readCount: number): string | null {
  if (readCount <= 0) return null;
  return `${formatReaders(readCount)} ${readCount === 1 ? "read" : "reads"}`;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return DATE_FMT.format(new Date(t));
}
