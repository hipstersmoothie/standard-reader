import { pcktBlocks, plaintextLinesFromBlock } from "./blocks";

/** Flatten pckt content to a single plaintext string (paragraphs joined). */
export function pcktPlaintext(content: unknown): string | null {
  const blocks = pcktBlocks(content);
  if (blocks.length === 0) return null;
  const text = blocks
    .flatMap((block) => plaintextLinesFromBlock(block))
    .join("\n\n");
  return text || null;
}

export { asPcktContent, asTextBlock, pcktBlocks } from "./blocks";
