import { leafletBlocks, plaintextLinesFromBlock } from "./blocks";
import type { LeafletTextBlock } from "./types";

/** Collect every `pub.leaflet.blocks.text` block from leaflet content. */
export function leafletTextBlocks(content: unknown): Array<LeafletTextBlock> {
  return leafletBlocks(content)
    .filter((block) => block.kind === "text")
    .map((block) => block.block);
}

/**
 * Flatten leaflet content to a single plaintext string (paragraphs joined).
 * `bskyPostText` optionally inlines narration for embedded Bluesky posts.
 */
export function leafletPlaintext(
  content: unknown,
  bskyPostText?: Map<string, string>,
): string | null {
  const blocks = leafletBlocks(content);
  if (blocks.length === 0) return null;
  const text = blocks
    .flatMap((block) => plaintextLinesFromBlock(block, bskyPostText))
    .join("\n\n");
  return text || null;
}

export { asLeafletContent, asTextBlock } from "./blocks";
