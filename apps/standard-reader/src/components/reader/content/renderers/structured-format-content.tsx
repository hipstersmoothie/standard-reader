"use client";

import { structuredFormatBlocks } from "#/lib/document/content-formats";

import type { ContentRendererProps } from "../types";
import { ArticleBody } from "./shared/article-body";
import { StructuredBlockView } from "./structured-block-view";

/**
 * Renders the block-based third-party formats (logue, afterword, wss
 * rich-text, OXA, fables, BlockNote) — each parses to the shared
 * `StructuredRenderableBlock` vocabulary.
 */
export function StructuredFormatContentRenderer({
  blobContext,
  codeHighlights,
  content,
  hasHero,
  skipFirstBlock,
}: ContentRendererProps) {
  const blocks = structuredFormatBlocks(content) ?? [];
  if (blocks.length === 0) return null;

  const firstTextIndex = blocks.findIndex((block, index) => {
    if (skipFirstBlock && index === 0 && block.kind === "image") return false;
    return block.kind === "text" && block.text.plaintext.trim().length > 0;
  });

  return (
    <ArticleBody hasHero={hasHero}>
      {blocks.map((block, index) => {
        if (skipFirstBlock && index === 0 && block.kind === "image") {
          return null;
        }
        const dropCap = block.kind === "text" && index === firstTextIndex;
        return (
          <StructuredBlockView
            key={index}
            block={block}
            blobContext={blobContext}
            codeHighlights={codeHighlights}
            dropCap={dropCap}
          />
        );
      })}
    </ArticleBody>
  );
}
