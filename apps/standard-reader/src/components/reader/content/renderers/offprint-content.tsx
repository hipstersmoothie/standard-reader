"use client";

import { offprintBlocks } from "#/lib/offprint/blocks";

import type { ContentRendererProps } from "../types";
import { ArticleBody } from "./shared/article-body";
import { StructuredBlockView } from "./structured-block-view";

/** Renders `app.offprint.content` — a flat list of typed blocks. */
export function OffprintContentRenderer({
  blobContext,
  codeHighlights,
  content,
  hasHero,
  skipFirstBlock,
}: ContentRendererProps) {
  const blocks = offprintBlocks(content);
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
