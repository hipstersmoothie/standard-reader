"use client";

import * as stylex from "@stylexjs/stylex";

import { useQuoteHighlightTracker } from "#/components/reader/quote-highlight-tracker";
import { asTextBlock } from "#/lib/leaflet/blocks";
import type {
  LeafletListItem,
  LeafletOrderedListBlock,
  LeafletUnorderedListBlock,
} from "#/lib/leaflet/types";
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

function nestedList(item: LeafletListItem, embedded = false) {
  if (item.children?.length) {
    return (
      <LeafletOrderedListBlockView
        block={{ children: item.children }}
        embedded={embedded}
        nested
      />
    );
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
        embedded={embedded}
        nested
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
      <LeafletOrderedListBlockView
        block={ordered as LeafletOrderedListBlock}
        embedded={embedded}
        nested
      />
    );
  }

  return null;
}

function LeafletListItems({
  items,
  ordered,
  startIndex,
  embedded = false,
  nested = false,
}: {
  items: Array<LeafletListItem>;
  ordered: boolean;
  startIndex?: number;
  embedded?: boolean;
  nested?: boolean;
}) {
  const tracker = useQuoteHighlightTracker();
  const ListTag = ordered ? "ol" : "ul";

  return (
    <ListTag
      {...stylex.props(
        articleBodyStyles.list,
        nested && articleBodyStyles.nestedList,
        embedded && articleBodyStyles.pageEmbedBlockSpacing,
      )}
      {...(ordered ? { start: startIndex ?? 1 } : {})}
    >
      {items.map((item, index) => {
        const text = listItemText(item);
        const subList = nestedList(item, embedded);
        if (!text && !subList) return null;

        const highlightRange =
          text == null
            ? null
            : (tracker?.consume(text.plaintext.length) ?? null);

        return (
          <li key={index} {...stylex.props(articleBodyStyles.listItem)}>
            {text ? (
              <HighlightedFacetedPlaintext
                plaintext={text.plaintext}
                facets={text.facets}
                highlightRange={highlightRange}
              />
            ) : null}
            {subList}
          </li>
        );
      })}
    </ListTag>
  );
}

export function LeafletUnorderedListBlockView({
  block,
  embedded = false,
  nested = false,
}: {
  block: LeafletUnorderedListBlock;
  embedded?: boolean;
  nested?: boolean;
}) {
  const children = block.children ?? [];
  const items = children.filter(
    (child) => listItemText(child) || nestedList(child),
  );
  if (items.length === 0) return null;

  return (
    <LeafletListItems
      embedded={embedded}
      items={items}
      nested={nested}
      ordered={false}
    />
  );
}

export function LeafletOrderedListBlockView({
  block,
  embedded = false,
  nested = false,
}: {
  block: LeafletOrderedListBlock;
  embedded?: boolean;
  nested?: boolean;
}) {
  const children = block.children ?? [];
  const items = children.filter(
    (child) => listItemText(child) || nestedList(child),
  );
  if (items.length === 0) return null;

  return (
    <LeafletListItems
      embedded={embedded}
      items={items}
      nested={nested}
      ordered
      startIndex={block.startIndex}
    />
  );
}
