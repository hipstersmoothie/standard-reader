import type { StructuredRenderableBlock } from "./types";

import { narrationImageLines } from "./image";

function textLines(text: { plaintext: string }): Array<string> {
  const trimmed = text.plaintext.trim();
  return trimmed ? [trimmed] : [];
}

export function plaintextLinesFromStructuredBlock(
  block: StructuredRenderableBlock,
): Array<string> {
  switch (block.kind) {
    case "text":
    case "heading": {
      return textLines(block.text);
    }
    case "blockquote": {
      return block.blocks.flatMap((child) =>
        plaintextLinesFromStructuredBlock(child),
      );
    }
    case "callout": {
      return textLines(block.text);
    }
    case "bulletList":
    case "orderedList": {
      return block.items.flatMap((item) => textLines(item));
    }
    case "taskList": {
      return block.items.flatMap((item) => textLines(item.text));
    }
    case "code": {
      return textLines({ plaintext: block.plaintext });
    }
    case "website": {
      const parts = [block.title?.trim(), block.description?.trim()].filter(
        Boolean,
      );
      return parts.length > 0 ? [parts.join(": ")] : [];
    }
    case "table": {
      return block.rows.map((row) =>
        row.flatMap((cell) => textLines(cell.text)).join(" | "),
      );
    }
    case "image": {
      return narrationImageLines(block.alt);
    }
    case "button": {
      const lines = [block.caption?.trim(), block.text.trim()].filter(Boolean);
      return lines.length > 0 ? [lines.join(": ")] : [];
    }
    case "math": {
      return textLines({ plaintext: block.tex });
    }
    case "imageGrid":
    case "imageCarousel": {
      const altLines = block.images.flatMap((image) =>
        narrationImageLines(image.alt),
      );
      const caption = block.caption?.trim();
      return caption ? [...altLines, caption] : altLines;
    }
    case "imageDiff": {
      const altLines = block.images.flatMap((image) =>
        narrationImageLines(image.alt),
      );
      const caption = block.caption?.trim();
      return caption ? [...altLines, caption] : altLines;
    }
    case "horizontalRule":
    case "blueskyEmbed":
    case "iframe":
    case "gallery":
    case "unknown": {
      return [];
    }
  }
}

export function structuredPlaintext(content: {
  items?: Array<unknown>;
}): string | null {
  if (!Array.isArray(content.items) || content.items.length === 0) {
    return null;
  }
  return null;
}

export function structuredPlaintextFromBlocks(
  blocks: Array<StructuredRenderableBlock>,
): string | null {
  if (blocks.length === 0) return null;
  const text = blocks
    .flatMap((block) => plaintextLinesFromStructuredBlock(block))
    .join("\n\n");
  return text || null;
}
