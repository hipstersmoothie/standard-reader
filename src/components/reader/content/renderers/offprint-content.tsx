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
