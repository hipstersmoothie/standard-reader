import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";

import { markdownPlaintext } from "#/lib/document/structured-content/markdown";
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

function appendUniquePart(parts: Array<string>, next: string | null) {
  const trimmed = next?.trim();
  if (!trimmed) return;
  if (parts.some((part) => part === trimmed)) return;
  parts.push(trimmed);
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

  const format = resolveContentFormat(contentFormat, contentJson);
  if (format === LEAFLET_CONTENT) {
    appendUniquePart(parts, leafletPlaintext(contentJson));
  } else if (format === PCKT_CONTENT) {
    appendUniquePart(parts, pcktPlaintext(contentJson));
  } else if (format === OFFPRINT_CONTENT) {
    appendUniquePart(parts, offprintPlaintext(contentJson));
  } else if (format === STANDARD_MARKDOWN_CONTENT) {
    appendUniquePart(parts, markdownPlaintext(contentJson));
  } else {
    appendUniquePart(
      parts,
      blocksPlaintext(
        parseArticleBlocks({
          textContent: null,
          contentJson: contentJson as JsonValue,
        }),
      ),
    );
  }

  if (parts.length === 0) return null;
  return parts.join("\n\n");
}
