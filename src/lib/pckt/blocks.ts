import type {
  PcktBlockquoteBlock,
  PcktBlueskyEmbedBlock,
  PcktCodeBlock,
  PcktContent,
  PcktGalleryBlock,
  PcktHeadingBlock,
  PcktIframeBlock,
  PcktImageBlock,
  PcktListBlock,
  PcktRenderableBlock,
  PcktTableBlock,
  PcktTaskListBlock,
  PcktTextBlock,
  PcktWebsiteBlock,
} from "./types";

import { PCKT_BLOCK, PCKT_CONTENT } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asTextBlock(value: unknown): PcktTextBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== PCKT_BLOCK.text) return null;
  if (typeof value.plaintext !== "string") return null;
  return value as unknown as PcktTextBlock;
}

function asHeadingBlock(value: unknown): PcktHeadingBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== PCKT_BLOCK.heading) return null;
  if (typeof value.plaintext !== "string") return null;
  return value as unknown as PcktHeadingBlock;
}

function asBlockquoteBlock(value: unknown): PcktBlockquoteBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== PCKT_BLOCK.blockquote) return null;
  return value as unknown as PcktBlockquoteBlock;
}

function asListBlock(value: unknown, kind: "bulletList" | "orderedList") {
  if (!isRecord(value)) return null;
  const type =
    kind === "bulletList" ? PCKT_BLOCK.bulletList : PCKT_BLOCK.orderedList;
  if (value.$type !== type) return null;
  return value as unknown as PcktListBlock;
}

function asTaskListBlock(value: unknown): PcktTaskListBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== PCKT_BLOCK.taskList) return null;
  return value as unknown as PcktTaskListBlock;
}

function asCodeBlock(value: unknown): PcktCodeBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== PCKT_BLOCK.codeBlock) return null;
  if (typeof value.plaintext !== "string") return null;
  return value as unknown as PcktCodeBlock;
}

function asIframeBlock(value: unknown): PcktIframeBlock | null {
  if (!isRecord(value)) return null;
  if (value.$type !== PCKT_BLOCK.iframe) return null;
  if (typeof value.url !== "string") return null;
  return value as unknown as PcktIframeBlock;
}

function asRenderableBlock(value: unknown): PcktRenderableBlock | null {
  if (!isRecord(value)) return null;

  const text = asTextBlock(value);
  if (text) return { kind: "text", block: text };

  const heading = asHeadingBlock(value);
  if (heading) return { kind: "heading", block: heading };

  const blockquote = asBlockquoteBlock(value);
  if (blockquote) return { kind: "blockquote", block: blockquote };

  const bulletList = asListBlock(value, "bulletList");
  if (bulletList) return { kind: "bulletList", block: bulletList };

  const orderedList = asListBlock(value, "orderedList");
  if (orderedList) return { kind: "orderedList", block: orderedList };

  const taskList = asTaskListBlock(value);
  if (taskList) return { kind: "taskList", block: taskList };

  if (value.$type === PCKT_BLOCK.image) {
    return { kind: "image", block: value as unknown as PcktImageBlock };
  }

  const code = asCodeBlock(value);
  if (code) return { kind: "code", block: code };

  const iframe = asIframeBlock(value);
  if (iframe) return { kind: "iframe", block: iframe };

  if (value.$type === PCKT_BLOCK.blueskyEmbed) {
    return {
      kind: "blueskyEmbed",
      block: value as unknown as PcktBlueskyEmbedBlock,
    };
  }

  if (value.$type === PCKT_BLOCK.table) {
    return { kind: "table", block: value as unknown as PcktTableBlock };
  }

  if (value.$type === PCKT_BLOCK.website) {
    return { kind: "website", block: value as unknown as PcktWebsiteBlock };
  }

  if (value.$type === PCKT_BLOCK.gallery) {
    return { kind: "gallery", block: value as unknown as PcktGalleryBlock };
  }

  if (value.$type === PCKT_BLOCK.horizontalRule) {
    return { kind: "horizontalRule" };
  }

  const blockType =
    typeof value.$type === "string" ? value.$type : "unknown block";
  return { kind: "unknown", blockType };
}

/** Every renderable block in document order. */
export function pcktBlocks(content: unknown): Array<PcktRenderableBlock> {
  if (!isRecord(content)) return [];
  if (content.$type !== PCKT_CONTENT) return [];
  const items = content.items;
  if (!Array.isArray(items)) return [];

  const result: Array<PcktRenderableBlock> = [];
  for (const item of items) {
    const parsed = asRenderableBlock(item);
    if (parsed) result.push(parsed);
  }
  return result;
}

function textLinesFromListContent(
  content: Array<Record<string, unknown>> | undefined,
): Array<string> {
  if (!content?.length) return [];
  const lines: Array<string> = [];
  for (const entry of content) {
    lines.push(...plaintextLinesFromUnknown(entry));
  }
  return lines;
}

function plaintextLinesFromUnknown(value: unknown): Array<string> {
  const block = asRenderableBlock(value);
  if (!block) return [];
  return plaintextLinesFromBlock(block);
}

/** Plaintext lines contributed by a single pckt block (for reading-time ingest). */
export function plaintextLinesFromBlock(
  block: PcktRenderableBlock,
): Array<string> {
  switch (block.kind) {
    case "text": {
      const text = block.block.plaintext.trim();
      return text ? [text] : [];
    }
    case "heading": {
      const text = block.block.plaintext.trim();
      return text ? [text] : [];
    }
    case "blockquote": {
      return textLinesFromListContent(
        block.block.content as Array<Record<string, unknown>> | undefined,
      );
    }
    case "bulletList":
    case "orderedList": {
      const children = block.block.content ?? [];
      const lines: Array<string> = [];
      for (const child of children) {
        if (!isRecord(child)) continue;
        lines.push(
          ...textLinesFromListContent(
            child.content as Array<Record<string, unknown>> | undefined,
          ),
        );
      }
      return lines;
    }
    case "taskList": {
      const children = block.block.content ?? [];
      const lines: Array<string> = [];
      for (const child of children) {
        if (!isRecord(child)) continue;
        lines.push(
          ...textLinesFromListContent(
            child.content as Array<Record<string, unknown>> | undefined,
          ),
        );
      }
      return lines;
    }
    case "code": {
      const text = block.block.plaintext.trim();
      return text ? [text] : [];
    }
    case "table": {
      const rows = block.block.content ?? [];
      const lines: Array<string> = [];
      for (const row of rows) {
        if (!isRecord(row)) continue;
        const cells = row.content as Array<Record<string, unknown>> | undefined;
        if (!cells?.length) continue;
        const cellText = cells.flatMap((cell) =>
          textLinesFromListContent(
            cell.content as Array<Record<string, unknown>> | undefined,
          ),
        );
        if (cellText.length > 0) lines.push(cellText.join(" | "));
      }
      return lines;
    }
    case "website": {
      const parts = [
        block.block.title?.trim(),
        block.block.description?.trim(),
      ].filter(Boolean);
      return parts.length > 0 ? [parts.join(": ")] : [];
    }
    case "horizontalRule":
    case "image":
    case "iframe":
    case "blueskyEmbed":
    case "gallery":
    case "unknown": {
      return [];
    }
  }
}

/** Normalize pckt code block language (may live in `attrs.language`). */
export function pcktCodeLanguage(block: PcktCodeBlock): string | undefined {
  if (block.language?.trim()) return block.language;
  return block.attrs?.language;
}

export function asPcktContent(content: unknown): PcktContent | null {
  if (!isRecord(content)) return null;
  if (content.$type !== PCKT_CONTENT) return null;
  return content as PcktContent;
}
