import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";

import {
  LEAFLET_DOCUMENT_FORMAT,
  altMarkdownText,
  htmlContentPlaintext,
  leafletDocumentContent,
  structuredFormatBlocks,
} from "#/lib/document/content-formats";
import { markdownPlaintext } from "#/lib/document/structured-content/markdown";
import { structuredPlaintextFromBlocks } from "#/lib/document/structured-content/plaintext";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { leafletPlaintext } from "#/lib/leaflet/plaintext";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { offprintPlaintext } from "#/lib/offprint/plaintext";
import { OFFPRINT_CONTENT } from "#/lib/offprint/types";
import { pcktPlaintext } from "#/lib/pckt/plaintext";
import { PCKT_CONTENT } from "#/lib/pckt/types";

import { blocksPlaintext, parseArticleBlocks } from "./blocks";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveContentFormat(
  contentFormat: string | null | undefined,
  contentJson: JsonValue | unknown,
): string | null {
  if (contentFormat) return contentFormat;
  if (isRecord(contentJson) && typeof contentJson.$type === "string") {
    return contentJson.$type;
  }
  return null;
}

/**
 * Aggressively normalize text for duplicate detection only: lowercase and
 * reduce to word tokens. Strips punctuation/markdown decoration (list bullets,
 * heading markers, emphasis) so the record text and block-extracted text
 * compare equal even when their formatting differs.
 */
function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Word n-gram size for approximate containment. */
const SHINGLE_SIZE = 5;
/** Fraction of `inner`'s shingles that must appear in `outer` to call it covered. */
const COVERAGE_THRESHOLD = 0.9;

function shingleSet(words: Array<string>): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + SHINGLE_SIZE <= words.length; i++) {
    set.add(words.slice(i, i + SHINGLE_SIZE).join(" "));
  }
  return set;
}

/**
 * Whether `inner` is (approximately) contained in `outer`. Exact substring
 * match on whitespace-normalized text, or ≥90% of `inner`'s word 5-grams
 * appearing in `outer` — which tolerates small differences between extractor
 * versions (e.g. navigation crumbs one version kept and another dropped).
 */
function isCovered(inner: string, outer: string): boolean {
  if (outer.includes(inner)) return true;
  const innerWords = inner.split(" ");
  if (innerWords.length < SHINGLE_SIZE * 2) return false;
  const outerShingles = shingleSet(outer.split(" "));
  if (outerShingles.size === 0) return false;
  let hits = 0;
  let total = 0;
  for (let i = 0; i + SHINGLE_SIZE <= innerWords.length; i++) {
    total += 1;
    if (outerShingles.has(innerWords.slice(i, i + SHINGLE_SIZE).join(" "))) {
      hits += 1;
    }
  }
  return total > 0 && hits / total >= COVERAGE_THRESHOLD;
}

/**
 * Append `next` unless it's already represented. Approximate containment on
 * whitespace-normalized text: the record `textContent` and the plaintext
 * extracted from structured blocks are usually the same body with different
 * paragraph joins or minor extractor differences, and equality-only dedupe
 * used to store the article twice — and made re-running the backfill append
 * another copy every run.
 */
function appendUniquePart(parts: Array<string>, next: string | null) {
  const trimmed = next?.trim();
  if (!trimmed) return;
  const normalized = normalizeForCompare(trimmed);
  if (!normalized) return;
  const kept: Array<string> = [];
  for (const part of parts) {
    const partNormalized = normalizeForCompare(part);
    // An existing part already covers the new one — nothing to add.
    if (isCovered(normalized, partNormalized)) return;
    // The new part supersedes this existing one — drop it.
    if (isCovered(partNormalized, normalized)) continue;
    kept.push(part);
  }
  parts.length = 0;
  parts.push(...kept, trimmed);
}

/** Plaintext extracted from structured `content` blocks only (no record text). */
export function documentExtractedText(
  contentJson: JsonValue | unknown,
  contentFormat?: string | null,
): string | null {
  const format = resolveContentFormat(contentFormat, contentJson);
  if (format === LEAFLET_CONTENT) {
    return leafletPlaintext(contentJson);
  }
  if (format === PCKT_CONTENT) {
    return pcktPlaintext(contentJson);
  }
  if (format === OFFPRINT_CONTENT) {
    return offprintPlaintext(contentJson);
  }
  if (format === STANDARD_MARKDOWN_CONTENT) {
    return markdownPlaintext(contentJson);
  }
  if (format === LEAFLET_DOCUMENT_FORMAT) {
    return leafletPlaintext(leafletDocumentContent(contentJson));
  }

  const structured = structuredFormatBlocks(contentJson, format);
  if (structured) return structuredPlaintextFromBlocks(structured);
  const markdown = altMarkdownText(contentJson, format);
  if (markdown) return markdown;
  const htmlText = htmlContentPlaintext(contentJson, format);
  if (htmlText) return htmlText;

  return blocksPlaintext(
    parseArticleBlocks({
      textContent: null,
      contentJson: contentJson as JsonValue,
    }),
  );
}

/**
 * Best-effort searchable body text: record `textContent` plus any plaintext
 * extracted from structured `content` blocks (leaflet pages, JSON blocks, etc.).
 */
export function documentSearchText({
  textContent,
  contentJson,
  contentFormat,
}: {
  textContent?: string | null;
  contentJson: JsonValue | unknown;
  contentFormat?: string | null;
}): string | null {
  const parts: Array<string> = [];
  appendUniquePart(parts, textContent ?? null);
  appendUniquePart(parts, documentExtractedText(contentJson, contentFormat));

  if (parts.length === 0) return null;
  return parts.join("\n\n");
}

/**
 * Recover a usable base text from a stored search blob that may contain
 * compounded copies of the extracted block plaintext. Earlier versions of the
 * search-text backfill fed the stored blob back in as `textContent` while the
 * dedupe matched on exact equality only, so every run appended another copy of
 * the extracted text (`record text + extracted × n`).
 *
 * Strips exact repeated `extracted` copies off the end, and if the remainder
 * still contains the body more than once (copies from older extractor versions
 * that differ slightly, so they can't be matched exactly), falls back to the
 * extracted text alone — it covers the whole article body, which is what
 * search needs.
 */
export function repairCompoundedSearchText(
  stored: string,
  extracted: string | null,
): string {
  const extractedTrimmed = extracted?.trim();
  if (!extractedTrimmed) return stored;

  let base = stored;
  const suffix = `\n\n${extractedTrimmed}`;
  while (base.endsWith(suffix)) base = base.slice(0, -suffix.length);
  if (base === extractedTrimmed) return base;

  const haystack = normalizeForCompare(base);
  const needle = normalizeForCompare(extractedTrimmed);
  if (!needle) return base;
  return countBodyOccurrences(haystack, needle) >= 2 ? extractedTrimmed : base;
}

/** Length of each probe sampled from the body for duplicate detection. */
const PROBE_LENGTH = 120;

/**
 * Approximate how many times `needle` (the article body) appears in
 * `haystack`. Old compounded copies may come from different extractor versions
 * and never match the current body wholesale, but their sentences still match
 * verbatim — so sample a few probe slices from the body and take the highest
 * exact-occurrence count.
 */
function countBodyOccurrences(haystack: string, needle: string): number {
  if (needle.length <= PROBE_LENGTH) {
    return countOccurrences(haystack, needle);
  }
  let max = 0;
  for (const at of [0.1, 0.5, 0.9]) {
    const start = Math.min(
      Math.floor(needle.length * at),
      needle.length - PROBE_LENGTH,
    );
    // Align on a word boundary so probes don't start mid-word.
    const wordStart = needle.indexOf(" ", start) + 1;
    const probe = needle.slice(wordStart, wordStart + PROBE_LENGTH).trim();
    if (!probe) continue;
    max = Math.max(max, countOccurrences(haystack, probe));
  }
  return max;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return count;
    count += 1;
    from = index + needle.length;
  }
}
