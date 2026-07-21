/**
 * Parser for `pub.oxa.document.document` (Curvenote OXA:AT) — a flat `blocks`
 * array of `pub.oxa.blocks.defs#*` entries. Facets are already emitted in the
 * leaflet/AT Proto byte-facet shape, so they pass straight through.
 */
import type { StructuredRenderableBlock, StructuredText } from "./types";

export const OXA_CONTENT = "pub.oxa.document.document";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function structuredText(value: Record<string, unknown>): StructuredText | null {
  if (typeof value.text !== "string" || !value.text.trim()) return null;
  return {
    facets: Array.isArray(value.facets) ? value.facets : undefined,
    plaintext: value.text,
  };
}

function asBlock(value: unknown): StructuredRenderableBlock | null {
  if (!isRecord(value) || typeof value.$type !== "string") return null;

  switch (value.$type) {
    case "pub.oxa.blocks.defs#paragraph": {
      const text = structuredText(value);
      return text ? { kind: "text", text } : null;
    }
    case "pub.oxa.blocks.defs#heading": {
      const text = structuredText(value);
      return text
        ? {
            kind: "heading",
            level: typeof value.level === "number" ? value.level : undefined,
            text,
          }
        : null;
    }
    case "pub.oxa.blocks.defs#code": {
      const plaintext =
        typeof value.text === "string"
          ? value.text
          : typeof value.code === "string"
            ? value.code
            : null;
      return plaintext
        ? {
            kind: "code",
            language:
              typeof value.language === "string" ? value.language : undefined,
            plaintext,
          }
        : null;
    }
    case "pub.oxa.blocks.defs#horizontalRule": {
      return { kind: "horizontalRule" };
    }
    default: {
      return { blockType: value.$type, kind: "unknown" };
    }
  }
}

/** Renderable blocks for a `pub.oxa.document.document` payload. */
export function oxaBlocks(
  content: unknown,
  contentFormat?: string | null,
): Array<StructuredRenderableBlock> {
  if (!isRecord(content)) return [];
  const format =
    typeof content.$type === "string" ? content.$type : contentFormat;
  if (format !== OXA_CONTENT) return [];
  const blocks = Array.isArray(content.blocks) ? content.blocks : [];

  const result: Array<StructuredRenderableBlock> = [];
  for (const entry of blocks) {
    const block = asBlock(entry);
    if (block) result.push(block);
  }
  return result;
}
