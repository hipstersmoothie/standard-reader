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

  let textSeen = false;

  return (
    <ArticleBody hasHero={hasHero}>
      {blocks.map((block, index) => {
        if (skipFirstBlock && index === 0 && block.kind === "image") {
          return null;
        }
        const dropCap = block.kind === "text" && !textSeen;
        if (block.kind === "text" && block.text.plaintext.trim()) {
          textSeen = true;
        }
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
