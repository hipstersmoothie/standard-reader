"use client";

import type { LeafletFacet } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "../../body-styles";
import { FacetedPlaintext } from "./faceted-text";

export interface BlockquoteParagraph {
  plaintext: string;
  facets?: Array<LeafletFacet> | Array<unknown>;
}

export function BlockquoteBlockView({
  paragraphs,
}: {
  paragraphs: Array<BlockquoteParagraph>;
}) {
  const items = paragraphs.filter((item) => item.plaintext.trim());
  if (items.length === 0) return null;

  return (
    <blockquote {...stylex.props(articleBodyStyles.pullquote)}>
      {items.map((item, index) => (
        <p key={index} {...stylex.props(articleBodyStyles.paragraph)}>
          <FacetedPlaintext plaintext={item.plaintext} facets={item.facets} />
        </p>
      ))}
    </blockquote>
  );
}
