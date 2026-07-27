"use client";

import { leafletBlocks } from "#/lib/leaflet/blocks";
import { collectLeafletFootnotes } from "#/lib/leaflet/footnotes";
import type { LeafletContent } from "#/lib/leaflet/types";

import type { ContentRendererProps } from "../types";
import { LeafletBlockView } from "./leaflet-block";
import { ArticleBody } from "./shared/article-body";
import { FootnoteNumberProvider } from "./shared/footnote-context";
import { FootnotesSection } from "./shared/footnotes-section";

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

  const firstTextIndex = blocks.findIndex((block, index) => {
    if (skipFirstBlock && index === 0 && block.kind === "image") return false;
    return block.kind === "text";
  });

  const { footnotes, numberById } = collectLeafletFootnotes(blocks);

  return (
    <ArticleBody hasHero={hasHero}>
      <FootnoteNumberProvider value={numberById}>
        {blocks.map((block, index) => {
          if (skipFirstBlock && index === 0 && block.kind === "image") {
            return null;
          }
          const dropCap = block.kind === "text" && index === firstTextIndex;
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
        <FootnotesSection footnotes={footnotes} />
      </FootnoteNumberProvider>
    </ArticleBody>
  );
}
