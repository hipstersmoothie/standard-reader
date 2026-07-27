"use client";

import * as stylex from "@stylexjs/stylex";

import { useQuoteHighlightTracker } from "#/components/reader/quote-highlight-tracker";
import type { LeafletFacet } from "#/lib/leaflet/types";

import { articleBodyStyles } from "../../body-styles";
import { HighlightedFacetedPlaintext } from "./faceted-text";

const styles = stylex.create({
  // The blockquote's own margin handles spacing to the next block, so the final
  // inner paragraph must not add its own bottom margin on top of it.
  lastParagraph: {
    marginBottom: 0,
  },
});

export interface BlockquoteParagraph {
  plaintext: string;
  facets?: Array<LeafletFacet> | Array<unknown>;
}

export function BlockquoteBlockView({
  paragraphs,
  embedded = false,
}: {
  paragraphs: Array<BlockquoteParagraph>;
  embedded?: boolean;
}) {
  const tracker = useQuoteHighlightTracker();
  const items = paragraphs.filter((item) => item.plaintext.trim());
  if (items.length === 0) return null;

  return (
    <blockquote
      {...stylex.props(
        articleBodyStyles.pullquote,
        embedded && articleBodyStyles.pageEmbedBlockSpacing,
      )}
    >
      {items.map((item, index) => {
        const highlightRange = tracker?.consume(item.plaintext.length) ?? null;
        return (
          <p
            key={index}
            {...stylex.props(
              articleBodyStyles.paragraph,
              embedded && articleBodyStyles.pageEmbedBlockInner,
              index === items.length - 1 && styles.lastParagraph,
            )}
          >
            <HighlightedFacetedPlaintext
              plaintext={item.plaintext}
              facets={item.facets}
              highlightRange={highlightRange}
            />
          </p>
        );
      })}
    </blockquote>
  );
}
