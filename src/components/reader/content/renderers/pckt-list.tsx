"use client";

import type {
  PcktListBlock,
  PcktListItemBlock,
  PcktTaskListBlock,
} from "#/lib/pckt/types";

import * as stylex from "@stylexjs/stylex";
import { useQuoteHighlightTracker } from "#/components/reader/quote-highlight-context";
import { asTextBlock } from "#/lib/pckt/blocks";
import { PCKT_BLOCK } from "#/lib/pckt/types";

import { articleBodyStyles } from "../body-styles";
import { HighlightedFacetedPlaintext } from "./shared/faceted-text";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ListItemContent({
  content,
}: {
  content: Array<Record<string, unknown>> | undefined;
}) {
  const tracker = useQuoteHighlightTracker();
  if (!content?.length) return null;

  return (
    <>
      {content.map((entry, index) => {
        const text = asTextBlock(entry);
        if (text?.plaintext.trim()) {
          const highlightRange =
            tracker?.consume(text.plaintext.length) ?? null;
          return (
            <HighlightedFacetedPlaintext
              key={index}
              plaintext={text.plaintext}
              facets={text.facets}
              highlightRange={highlightRange}
            />
          );
        }

        if (isRecord(entry) && typeof entry.$type === "string") {
          return <PcktInlineBlock key={index} value={entry} />;
        }

        return null;
      })}
    </>
  );
}

function PcktInlineBlock({ value }: { value: Record<string, unknown> }) {
  const blockType = value.$type;
  if (blockType === PCKT_BLOCK.bulletList) {
    return <PcktBulletListBlockView block={value as PcktListBlock} />;
  }
  if (blockType === PCKT_BLOCK.orderedList) {
    return <PcktOrderedListBlockView block={value as PcktListBlock} />;
  }
  if (blockType === PCKT_BLOCK.taskList) {
    return <PcktTaskListBlockView block={value as PcktTaskListBlock} />;
  }
  return null;
}

function listItems(
  content: Array<PcktListItemBlock | Record<string, unknown>> | undefined,
) {
  return (content ?? []).flatMap((child, index) => {
    if (!isRecord(child)) return [];
    const itemContent = child.content as
      | Array<Record<string, unknown>>
      | undefined;
    if (!itemContent?.length) return [];
    return [{ key: index, content: itemContent }];
  });
}

export function PcktBulletListBlockView({ block }: { block: PcktListBlock }) {
  const items = listItems(block.content);
  if (items.length === 0) return null;

  return (
    <ul {...stylex.props(articleBodyStyles.list)}>
      {items.map((item) => (
        <li key={item.key} {...stylex.props(articleBodyStyles.listItem)}>
          <ListItemContent content={item.content} />
        </li>
      ))}
    </ul>
  );
}

export function PcktOrderedListBlockView({ block }: { block: PcktListBlock }) {
  const items = listItems(block.content);
  if (items.length === 0) return null;
  const start = block.start ?? 1;

  return (
    <ol {...stylex.props(articleBodyStyles.list)} start={start}>
      {items.map((item) => (
        <li key={item.key} {...stylex.props(articleBodyStyles.listItem)}>
          <ListItemContent content={item.content} />
        </li>
      ))}
    </ol>
  );
}

export function PcktTaskListBlockView({ block }: { block: PcktTaskListBlock }) {
  const items = (block.content ?? []).flatMap((child, index) => {
    if (!isRecord(child)) return [];
    const itemContent = child.content as
      | Array<Record<string, unknown>>
      | undefined;
    if (!itemContent?.length) return [];
    const checked = Boolean(
      isRecord(child.attrs) && child.attrs.checked === true,
    );
    return [{ key: index, content: itemContent, checked }];
  });

  if (items.length === 0) return null;

  return (
    <ul {...stylex.props(articleBodyStyles.taskList)}>
      {items.map((item) => (
        <li key={item.key} {...stylex.props(articleBodyStyles.taskItem)}>
          <input
            type="checkbox"
            checked={item.checked}
            readOnly
            aria-hidden
            tabIndex={-1}
            {...stylex.props(articleBodyStyles.taskCheckbox)}
          />
          <span>
            <ListItemContent content={item.content} />
          </span>
        </li>
      ))}
    </ul>
  );
}
