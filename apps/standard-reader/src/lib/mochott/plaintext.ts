/**
 * Plaintext for a mochott body, for the paths that need text rather than
 * components: search indexing and the page reader.
 *
 * The blocks come from the shared structured dispatch (`renderer-core`), the
 * same parse the reading view renders, so what search finds and what a reader
 * hears can't drift from what they see.
 */

import { structuredFormatBlocks } from "#/lib/document/content-formats";
import { structuredPlaintextFromBlocks } from "#/lib/document/structured-content/plaintext";

import { MOCHOTT_ARTICLE } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Plaintext for a mochott body. The record carries its own `textContent` (the
 * lexicon's field for "text-only consumers"), which is preferred when present;
 * otherwise it is walked out of the parsed blocks.
 */
export function mochottPlaintext(
  content: unknown,
  contentFormat?: string | null,
): string | null {
  const blocks = structuredFormatBlocks(
    content,
    contentFormat ?? MOCHOTT_ARTICLE,
  );
  if (!blocks?.length) return null;

  const recordText =
    isRecord(content) && typeof content.textContent === "string"
      ? content.textContent.trim()
      : "";
  return recordText || structuredPlaintextFromBlocks(blocks);
}
