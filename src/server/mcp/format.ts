import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { describeError } from "./errors";

/**
 * Fields the AppView returns that are expensive and rarely what a model asked
 * for. `content` is the full renderable article body (often tens of kilobytes);
 * the `*Html` fields are pre-highlighted search markup duplicating `title` /
 * `description`. Stripped unless a tool explicitly opts back in.
 */
const HEAVY_KEYS = new Set([
  "content",
  "contentFormat",
  "hasRenderableBody",
  "searchSnippetHtml",
  "searchTitleHtml",
]);

export interface SlimOptions {
  /** Keep the renderable article body. Off by default. */
  includeContent?: boolean;
}

/**
 * Recursively drop heavy fields and `null`/`undefined` entries from an XRPC
 * response. Purely subtractive — no key is renamed or moved, so what a tool
 * returns still reads as the lexicon shape it came from.
 */
export function slim(value: unknown, options: SlimOptions = {}): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => slim(entry, options));
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || entry === undefined) continue;
    if (!options.includeContent && HEAVY_KEYS.has(key)) continue;
    out[key] = slim(entry, options);
  }
  return out;
}

/** A successful tool result carrying JSON. */
export function jsonResult(
  value: unknown,
  options: SlimOptions = {},
): CallToolResult {
  return {
    content: [
      { type: "text", text: JSON.stringify(slim(value, options), null, 2) },
    ],
  };
}

/** A successful tool result carrying prose. */
export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/** An error tool result. MCP reports tool failures in-band, not as protocol errors. */
export function errorResult(error: unknown): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: describeError(error) }],
  };
}
