"use client";

import type { LeafletFacet } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import {
  HighlightedPlaintext,
  useQuoteHighlightTracker,
} from "#/components/reader/quote-highlight-context";
import { createElement } from "react";

import { articleBodyStyles } from "../../body-styles";
import { HighlightedFacetedPlaintext } from "./faceted-text";

export function HeadingBlockView({
  plaintext,
  level = 2,
  facets,
}: {
  plaintext: string;
  level?: number;
  facets?: Array<LeafletFacet> | Array<unknown>;
}) {
  const tracker = useQuoteHighlightTracker();
  const highlightRange = tracker?.consume(plaintext.length) ?? null;

  if (!plaintext) return null;
  const clamped = Math.min(6, Math.max(1, level));
  const style =
    clamped <= 1 ? articleBodyStyles.heading1 : articleBodyStyles.heading2;

  return createElement(
    `h${clamped}`,
    { ...stylex.props(style) },
    facets?.length ? (
      <HighlightedFacetedPlaintext
        plaintext={plaintext}
        facets={facets}
        highlightRange={highlightRange}
      />
    ) : (
      <HighlightedPlaintext
        plaintext={plaintext}
        highlightRange={highlightRange}
      />
    ),
  );
}
