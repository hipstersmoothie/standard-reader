import type { BasicTheme, ThemeRgb } from "../atproto/types.ts";

/**
 * Strip NUL bytes (`\u0000`) from a string. Postgres `text` columns reject NUL,
 * and network records occasionally contain them.
 */
export function stripNullBytes(value: string): string {
  return value.replaceAll("\u0000", "");
}

/**
 * Longest tag we will store, in graphemes.
 *
 * Matches the lexicon: `site.standard.document` declares `maxGraphemes: 128`
 * for a tag, and our own `app.standard-reader` defs declare `maxLength: 128`.
 * A record whose tags exceed it is malformed, not merely unusual.
 */
export const MAX_TAG_GRAPHEMES = 128;

/**
 * Sanitize a record's `tags` array for storage.
 *
 * Over-long tags are dropped, not truncated. A 5KB "tag" is a headline someone
 * put in the wrong field, and half of it is not a tag either — keeping a
 * truncated version would pollute tag pages and search with garbage that looks
 * deliberate.
 *
 * This exists because three records with 56 tags each, the longest 5,403 bytes,
 * jammed the ingest from 2026-08-01 onward. `documents_tags_norm_idx` is a GIN
 * index over the tags array and a key that size exceeds Postgres's index-entry
 * limit, so every insert failed, every retry failed the same way, and the rows
 * sat in `ingest_dead_letter` at max retries until someone went looking. Their
 * PDSes now refuse to serve them at all for the same lexicon violation.
 *
 * Dropping the bad tags keeps the rest of the record — title, body, everything
 * a reader actually wants — instead of losing the whole article to one bad
 * field.
 */
export function cleanTags(value: unknown): Array<string> | null {
  if (!Array.isArray(value)) return null;
  const segmenter =
    globalThis.Intl?.Segmenter === undefined
      ? null
      : new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const count = (text: string): number => {
    if (!segmenter) return [...text].length;
    let n = 0;
    for (const _ of segmenter.segment(text)) n++;
    return n;
  };

  const tags: Array<string> = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const tag = stripNullBytes(raw).trim();
    if (tag.length === 0) continue;
    if (count(tag) > MAX_TAG_GRAPHEMES) continue;
    tags.push(tag);
  }
  return tags;
}

/** Clean an optional text field: coerce non-strings to null, strip NUL bytes,
 * and treat the empty result as null. */
export function cleanOptional(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = stripNullBytes(value);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Deep-sanitize a value for `jsonb` storage by removing NUL bytes from every
 * nested string (Postgres `jsonb` also rejects `\u0000`). Returns null for
 * absent values.
 */
export function sanitizeJson(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.parse(JSON.stringify(value).replaceAll(String.raw`\u0000`, ""));
}

/** Parse an ISO datetime string into a Date, or null if absent/invalid. */
export function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** Convert a `site.standard.theme.color#rgb` object to a CSS `rgb(...)` string. */
export function rgbToCss(color: ThemeRgb | undefined): string | null {
  if (
    !color ||
    typeof color.r !== "number" ||
    typeof color.g !== "number" ||
    typeof color.b !== "number"
  ) {
    return null;
  }
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

export interface FlatTheme {
  themeAccent: string | null;
  themeBackground: string | null;
  themeForeground: string | null;
  themeAccentForeground: string | null;
}

/** Flatten a `basicTheme` object into CSS color strings. */
export function flattenTheme(theme: BasicTheme | undefined): FlatTheme {
  return {
    themeAccent: rgbToCss(theme?.accent),
    themeBackground: rgbToCss(theme?.background),
    themeForeground: rgbToCss(theme?.foreground),
    themeAccentForeground: rgbToCss(theme?.accentForeground),
  };
}

/**
 * Normalize a publication URL for storage and `(did, url)` grouping: strip NUL
 * bytes, trim whitespace, and drop trailing slashes so `https://x.com` and
 * `https://x.com/` collapse to one publication. Publishers re-create their
 * publication record with slash variants of the same url, which would
 * otherwise defeat the dedupe sweep and split documents across pages.
 */
export function normalizePublicationUrl(url: string): string {
  return stripNullBytes(url).trim().replace(/\/+$/, "");
}

/**
 * Build a canonical document URL from a publication/site base URL and the
 * document `path`. Returns null when there's no base to anchor on.
 */
export function buildCanonicalUrl(
  base: string | null,
  path: string | null | undefined,
): string | null {
  if (!base) {
    return null;
  }
  const trimmed = base.replace(/\/+$/, "");
  if (!path) {
    return trimmed;
  }
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}${withSlash}`;
}
