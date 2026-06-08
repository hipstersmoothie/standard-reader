"use client";

import type { LeafletFacet } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { useQuoteHighlightTracker } from "#/components/reader/quote-highlight-tracker";

import { articleBodyStyles } from "../../body-styles";
import { HighlightedFacetedPlaintext } from "./faceted-text";

export interface BlockquoteParagraph {
  plaintext: string;
  facets?: Array<LeafletFacet> | Array<unknown>;
}

export function BlockquoteBlockView({
  paragraphs,
}: {
  paragraphs: Array<BlockquoteParagraph>;
}) {
  const tracker = useQuoteHighlightTracker();
  const items = paragraphs.filter((item) => item.plaintext.trim());
  if (items.length === 0) return null;

  return (
    <blockquote {...stylex.props(articleBodyStyles.pullquote)}>
      {items.map((item, index) => {
        const highlightRange = tracker?.consume(item.plaintext.length) ?? null;
        return (
          <p key={index} {...stylex.props(articleBodyStyles.paragraph)}>
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
