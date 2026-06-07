"use client";

import type { PcktContent } from "#/lib/pckt/types";

import { pcktBlocks } from "#/lib/pckt/blocks";

import type { ContentRendererProps } from "../types";

import { PcktBlockView } from "./pckt-block";
import { ArticleBody } from "./shared/article-body";

/** Renders `blog.pckt.content` — a flat list of typed blocks. */
export function PcktContentRenderer({
  blobContext,
  codeHighlights,
  content,
  hasHero,
}: ContentRendererProps) {
  const blocks = pcktBlocks(content as PcktContent);
  if (blocks.length === 0) return null;

  let textSeen = false;

  return (
    <ArticleBody hasHero={hasHero}>
      {blocks.map((block, index) => {
        const dropCap = block.kind === "text" && !textSeen;
        if (block.kind === "text" && block.block.plaintext.trim()) {
          textSeen = true;
        }
        return (
          <PcktBlockView
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
