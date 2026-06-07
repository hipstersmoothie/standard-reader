"use client";

import type { LeafletContent } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { leafletBlocks } from "#/lib/leaflet/blocks";

import type { ContentRendererProps } from "../types";

import { articleBodyStyles } from "../body-styles";
import { LeafletBlockView } from "./leaflet-block";

/** Renders `pub.leaflet.content` — linear pages of typed blocks. */
export function LeafletContentRenderer({
  blobContext,
  codeHighlights,
  content,
  hasHero,
}: ContentRendererProps) {
  const leaflet = content as LeafletContent;
  const blocks = leafletBlocks(leaflet);

  if (blocks.length === 0) return null;

  let textSeen = false;

  return (
    <div
      {...stylex.props(
        articleBodyStyles.body,
        hasHero ? articleBodyStyles.bodyAfterHero : undefined,
      )}
    >
      {blocks.map((block, index) => {
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
    </div>
  );
}
