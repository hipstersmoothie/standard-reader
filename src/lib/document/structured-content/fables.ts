/**
 * Parser for `ca.justexe.fables.blocks` — a `blocks` array of editor blocks
 * with plain-string `content` (`{ type: "paragraph", content: "…" }`).
 * Per-block visual styling (`style`) is intentionally dropped; the reader
 * applies its own typography.
 */
import type { StructuredRenderableBlock } from "./types";

export const FABLES_CONTENT = "ca.justexe.fables.blocks";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBlock(value: unknown): StructuredRenderableBlock | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const content = typeof value.content === "string" ? value.content.trim() : "";

  switch (value.type) {
    case "paragraph": {
      return content ? { kind: "text", text: { plaintext: content } } : null;
    }
    case "heading": {
      return content
        ? {
            kind: "heading",
            level: typeof value.level === "number" ? value.level : undefined,
            text: { plaintext: content },
          }
        : null;
    }
    case "quote":
    case "blockquote": {
      return content
        ? {
            blocks: [{ kind: "text", text: { plaintext: content } }],
            kind: "blockquote",
          }
        : null;
    }
    case "divider": {
      return { kind: "horizontalRule" };
    }
    default: {
      return content
        ? { kind: "text", text: { plaintext: content } }
        : { blockType: value.type, kind: "unknown" };
    }
  }
}

/** Renderable blocks for a `ca.justexe.fables.blocks` payload. */
export function fablesBlocks(
  content: unknown,
  contentFormat?: string | null,
): Array<StructuredRenderableBlock> {
  if (!isRecord(content)) return [];
  const format =
    typeof content.$type === "string" ? content.$type : contentFormat;
  if (format !== FABLES_CONTENT) return [];
  const blocks = Array.isArray(content.blocks) ? content.blocks : [];

  const result: Array<StructuredRenderableBlock> = [];
  for (const entry of blocks) {
    const block = asBlock(entry);
    if (block) result.push(block);
  }
  return result;
}
