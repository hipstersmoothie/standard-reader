"use client";

import type {
  LeafletListItem,
  LeafletOrderedListBlock,
  LeafletUnorderedListBlock,
} from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { useQuoteHighlightTracker } from "#/components/reader/quote-highlight-context";
import { asTextBlock } from "#/lib/leaflet/blocks";
import { LEAFLET_BLOCK } from "#/lib/leaflet/types";

import { articleBodyStyles } from "../body-styles";
import { HighlightedFacetedPlaintext } from "./shared/faceted-text";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listItemText(item: LeafletListItem) {
  const text = asTextBlock(item.content);
  if (!text?.plaintext.trim()) return null;
  return text;
}

function nestedList(item: LeafletListItem) {
  if (item.children?.length) {
    return <LeafletOrderedListBlockView block={{ children: item.children }} />;
  }

  const unordered = item.unorderedListChildren;
  if (
    isRecord(unordered) &&
    unordered.$type === LEAFLET_BLOCK.unorderedList &&
    Array.isArray(unordered.children) &&
    unordered.children.length > 0
  ) {
    return (
      <LeafletUnorderedListBlockView
        block={unordered as LeafletUnorderedListBlock}
      />
    );
  }

  const ordered = item.orderedListChildren;
  if (
    isRecord(ordered) &&
    ordered.$type === LEAFLET_BLOCK.orderedList &&
    Array.isArray(ordered.children) &&
    ordered.children.length > 0
  ) {
    return (
      <LeafletOrderedListBlockView block={ordered as LeafletOrderedListBlock} />
    );
  }

  return null;
}

function LeafletListItems({
  items,
  ordered,
  startIndex,
}: {
  items: Array<LeafletListItem>;
  ordered: boolean;
  startIndex?: number;
}) {
  const tracker = useQuoteHighlightTracker();
  const ListTag = ordered ? "ol" : "ul";

  return (
    <ListTag
      {...stylex.props(articleBodyStyles.list)}
      {...(ordered ? { start: startIndex ?? 1 } : {})}
    >
      {items.map((item, index) => {
        const text = listItemText(item);
        const nested = nestedList(item);
        if (!text && !nested) return null;

        const highlightRange =
          text != null
            ? (tracker?.consume(text.plaintext.length) ?? null)
            : null;

        return (
          <li key={index} {...stylex.props(articleBodyStyles.listItem)}>
            {text ? (
              <HighlightedFacetedPlaintext
                plaintext={text.plaintext}
                facets={text.facets}
                highlightRange={highlightRange}
              />
            ) : null}
            {nested}
          </li>
        );
      })}
    </ListTag>
  );
}

export function LeafletUnorderedListBlockView({
  block,
}: {
  block: LeafletUnorderedListBlock;
}) {
  const children = block.children ?? [];
  const items = children.filter(
    (child) => listItemText(child) || nestedList(child),
  );
  if (items.length === 0) return null;

  return <LeafletListItems items={items} ordered={false} />;
}

export function LeafletOrderedListBlockView({
  block,
}: {
  block: LeafletOrderedListBlock;
}) {
  const children = block.children ?? [];
  const items = children.filter(
    (child) => listItemText(child) || nestedList(child),
  );
  if (items.length === 0) return null;

  return (
    <LeafletListItems items={items} ordered startIndex={block.startIndex} />
  );
}
