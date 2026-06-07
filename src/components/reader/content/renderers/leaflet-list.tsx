"use client";

import type { LeafletUnorderedListBlock } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { asTextBlock } from "#/lib/leaflet/blocks";

import { articleBodyStyles } from "../body-styles";
import { FacetedPlaintext } from "./shared/faceted-text";

export function LeafletUnorderedListBlockView({
  block,
}: {
  block: LeafletUnorderedListBlock;
}) {
  const children = block.children ?? [];
  const items = children.flatMap((child) => {
    const item = asTextBlock(child.content);
    if (!item?.plaintext.trim()) return [];
    return [item];
  });

  if (items.length === 0) return null;

  return (
    <ul {...stylex.props(articleBodyStyles.list)}>
      {items.map((item, index) => (
        <li key={index} {...stylex.props(articleBodyStyles.listItem)}>
          <FacetedPlaintext plaintext={item.plaintext} facets={item.facets} />
        </li>
      ))}
    </ul>
  );
}
