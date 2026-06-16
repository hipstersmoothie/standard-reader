"use client";

import type { LeafletContent } from "#/lib/leaflet/types";

import { leafletBlocks } from "#/lib/leaflet/blocks";

import type { ContentRendererProps } from "../types";

import { LeafletBlockView } from "./leaflet-block";
import { ArticleBody } from "./shared/article-body";

/** Renders `pub.leaflet.content` — linear pages of typed blocks. */
export function LeafletContentRenderer({
  blobContext,
  codeHighlights,
  content,
  hasHero,
  skipFirstBlock,
}: ContentRendererProps) {
  const blocks = leafletBlocks(content as LeafletContent);
  if (blocks.length === 0) return null;

  let textSeen = false;

  return (
    <ArticleBody hasHero={hasHero}>
      {blocks.map((block, index) => {
        if (skipFirstBlock && index === 0 && block.kind === "image") {
          return null;
        }
        const dropCap = block.kind === "text" && !textSeen;
        if (block.kind === "text") textSeen = true;
        return (
          <LeafletBlockView
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
