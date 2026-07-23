"use client";

import {
  pcktBlocks,
  pcktLeadingHeadingMatchesDescription,
} from "#/lib/pckt/blocks";
import type { PcktContent } from "#/lib/pckt/types";

import type { ContentRendererProps } from "../types";
import { PcktBlockView } from "./pckt-block";
import { ArticleBody } from "./shared/article-body";

/** Renders `blog.pckt.content` — a flat list of typed blocks. */
export function PcktContentRenderer({
  blobContext,
  codeHighlights,
  content,
  hasHero,
  skipFirstBlock,
  leadDescription,
}: ContentRendererProps) {
  const parsed = pcktBlocks(content as PcktContent);

  // Drop a leading heading that merely repeats the document's header
  // description — the reader shows that text as the header dek instead (see
  // `pcktLeadingHeadingMatchesDescription`), so rendering it here would duplicate it.
  const blocks = pcktLeadingHeadingMatchesDescription(content, leadDescription)
    ? parsed.slice(1)
    : parsed;

  if (blocks.length === 0) return null;

  const firstTextIndex = blocks.findIndex((block, index) => {
    if (skipFirstBlock && index === 0 && block.kind === "image") return false;
    return block.kind === "text" && block.block.plaintext.trim().length > 0;
  });

  return (
    <ArticleBody hasHero={hasHero}>
      {blocks.map((block, index) => {
        if (skipFirstBlock && index === 0 && block.kind === "image") {
          return null;
        }
        const dropCap = block.kind === "text" && index === firstTextIndex;
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
