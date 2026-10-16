"use client";

import { leafletBlocks } from "#/lib/leaflet/blocks";
import { collectLeafletFootnotes } from "#/lib/leaflet/footnotes";
import type { LeafletContent } from "#/lib/leaflet/types";

import type { ContentRendererProps } from "../types";
import { LeafletBlockView } from "./leaflet-block";
import { LeafletBlockList } from "./leaflet-canvas";
import { ArticleBody } from "./shared/article-body";
import { FootnoteNumberProvider } from "./shared/footnote-context";
import { FootnotesSection } from "./shared/footnotes-section";

/** Renders `pub.leaflet.content` — linear pages of typed blocks. */
export function LeafletContentRenderer({
  articleUrl,
  blobContext,
  codeHighlights,
  content,
  hasHero,
  skipFirstBlock,
}: ContentRendererProps) {
  const blocks = leafletBlocks(content as LeafletContent);
  if (blocks.length === 0) return null;

  // A canvas block keeps its place on the canvas: it is never lifted into the
  // header as a hero, and its text gets no drop cap.
  const skipsFirst =
    skipFirstBlock && blocks[0]?.kind === "image" && !blocks[0].canvas;
  const firstTextIndex = blocks.findIndex(
    (block, index) =>
      !(skipsFirst && index === 0) && block.kind === "text" && !block.canvas,
  );

  const { footnotes, numberById } = collectLeafletFootnotes(blocks);

  return (
    <ArticleBody hasHero={hasHero}>
      <FootnoteNumberProvider value={numberById}>
        <LeafletBlockList
          entries={blocks
            .map((block, index) => ({ block, index }))
            .filter(({ index }) => !(skipsFirst && index === 0))}
          blobContext={blobContext}
          renderBlock={(block, index) => (
            <LeafletBlockView
              block={block}
              blobContext={blobContext}
              codeHighlights={codeHighlights}
              articleUrl={articleUrl}
              dropCap={index === firstTextIndex}
            />
          )}
        />
        <FootnotesSection footnotes={footnotes} />
      </FootnoteNumberProvider>
    </ArticleBody>
  );
}
