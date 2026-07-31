"use client";

import * as stylex from "@stylexjs/stylex";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import { HighlightedPlaintext } from "#/components/reader/quote-highlight-context";
import { useQuoteHighlightTracker } from "#/components/reader/quote-highlight-tracker";
import { parseBskyClientUrl } from "#/lib/atproto/bsky-clients";
import { normalizeImageAlt } from "#/lib/document/structured-content/image";
import type {
  StructuredListItem,
  StructuredRenderableBlock,
  StructuredText,
} from "#/lib/document/structured-content/types";
import type { QuoteHighlightRange } from "#/lib/quote-highlight-text";

import { articleBodyStyles } from "../body-styles";
import { BskyClientEmbedView } from "./shared/bsky-client-embed";
import { HighlightedFacetedPlaintext } from "./shared/faceted-text";

export function WebsiteCardBody({
  title,
  description,
  titleRange,
  descriptionRange,
  showExternalIcon = true,
}: {
  title?: string;
  description?: string;
  titleRange?: QuoteHighlightRange | null | undefined;
  descriptionRange?: QuoteHighlightRange | null | undefined;
  showExternalIcon?: boolean;
}) {
  const cardTitle = title?.trim();
  const cardDescription = description?.trim();

  return (
    <div {...stylex.props(articleBodyStyles.websiteCardBody)}>
      <div {...stylex.props(articleBodyStyles.websiteCardText)}>
        {cardTitle ? (
          <p {...stylex.props(articleBodyStyles.websiteCardTitle)}>
            <HighlightedPlaintext
              plaintext={cardTitle}
              highlightRange={titleRange ?? null}
            />
          </p>
        ) : null}
        {cardDescription ? (
          <p {...stylex.props(articleBodyStyles.websiteCardDescription)}>
            <HighlightedPlaintext
              plaintext={cardDescription}
              highlightRange={descriptionRange ?? null}
            />
          </p>
        ) : null}
      </div>
      {showExternalIcon ? (
        <span {...stylex.props(articleBodyStyles.websiteCardExternalIcon)}>
          <ExternalLink aria-hidden size={16} />
        </span>
      ) : null}
    </div>
  );
}

/**
 * A list item's own text, plus any list nested beneath it.
 *
 * The nested blocks are rendered by the caller (`StructuredBlockView`) rather
 * than here: the block view already knows how to render every kind, and having
 * it call back in avoids a cycle between the two modules.
 */
interface StructuredListViewProps {
  items: Array<StructuredListItem>;
  renderChildBlock?: (
    block: StructuredRenderableBlock,
    index: number,
  ) => ReactNode;
}

function renderNestedBlocks(
  children: Array<StructuredRenderableBlock> | undefined,
  renderChildBlock: StructuredListViewProps["renderChildBlock"],
): ReactNode {
  if (!children?.length || !renderChildBlock) return null;
  return children.map((child, index) => renderChildBlock(child, index));
}

export function StructuredBulletListView({
  items,
  renderChildBlock,
}: StructuredListViewProps) {
  const tracker = useQuoteHighlightTracker();
  if (items.length === 0) return null;

  return (
    <ul {...stylex.props(articleBodyStyles.list)}>
      {items.map((item, index) => {
        const highlightRange =
          tracker?.consume(item.text.plaintext.length) ?? null;
        return (
          <li key={index} {...stylex.props(articleBodyStyles.listItem)}>
            <HighlightedFacetedPlaintext
              plaintext={item.text.plaintext}
              facets={item.text.facets}
              highlightRange={highlightRange}
            />
            {renderNestedBlocks(item.children, renderChildBlock)}
          </li>
        );
      })}
    </ul>
  );
}

export function StructuredOrderedListView({
  items,
  renderChildBlock,
  start,
}: StructuredListViewProps & { start?: number }) {
  const tracker = useQuoteHighlightTracker();
  if (items.length === 0) return null;

  return (
    <ol {...stylex.props(articleBodyStyles.list)} start={start ?? 1}>
      {items.map((item, index) => {
        const highlightRange =
          tracker?.consume(item.text.plaintext.length) ?? null;
        return (
          <li key={index} {...stylex.props(articleBodyStyles.listItem)}>
            <HighlightedFacetedPlaintext
              plaintext={item.text.plaintext}
              facets={item.text.facets}
              highlightRange={highlightRange}
            />
            {renderNestedBlocks(item.children, renderChildBlock)}
          </li>
        );
      })}
    </ol>
  );
}

export function StructuredTaskListView({
  items,
}: {
  items: Array<{ checked?: boolean; text: StructuredText }>;
}) {
  const tracker = useQuoteHighlightTracker();
  if (items.length === 0) return null;

  return (
    <ul {...stylex.props(articleBodyStyles.taskList)}>
      {items.map((item, index) => {
        const highlightRange =
          tracker?.consume(item.text.plaintext.length) ?? null;
        return (
          <li key={index} {...stylex.props(articleBodyStyles.taskItem)}>
            <input
              type="checkbox"
              checked={item.checked === true}
              readOnly
              aria-hidden
              tabIndex={-1}
              {...stylex.props(articleBodyStyles.taskCheckbox)}
            />
            <span>
              <HighlightedFacetedPlaintext
                plaintext={item.text.plaintext}
                facets={item.text.facets}
                highlightRange={highlightRange}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function StructuredTableView({
  rows,
}: {
  rows: Array<Array<{ isHeader?: boolean; text: StructuredText }>>;
}) {
  const tracker = useQuoteHighlightTracker();
  if (rows.length === 0) return null;

  return (
    <table {...stylex.props(articleBodyStyles.table)}>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => {
              const highlightRange =
                tracker?.consume(cell.text.plaintext.length) ?? null;
              const CellTag = cell.isHeader ? "th" : "td";
              return (
                <CellTag
                  key={cellIndex}
                  {...stylex.props(
                    articleBodyStyles.tableCell,
                    cell.isHeader
                      ? articleBodyStyles.tableHeaderCell
                      : undefined,
                  )}
                >
                  <HighlightedFacetedPlaintext
                    plaintext={cell.text.plaintext}
                    facets={cell.text.facets}
                    highlightRange={highlightRange}
                  />
                </CellTag>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StructuredWebsiteView({
  src,
  title,
  description,
  previewImage,
}: {
  src: string;
  title?: string;
  description?: string;
  previewImage?: string;
}) {
  const tracker = useQuoteHighlightTracker();
  const cardTitle = title?.trim();
  const cardDescription = description?.trim();
  const image = previewImage?.trim();
  const titleRange = cardTitle
    ? (tracker?.consume(cardTitle.length) ?? null)
    : null;
  const descriptionRange = cardDescription
    ? (tracker?.consume(cardDescription.length) ?? null)
    : null;

  const card = (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      {...stylex.props(articleBodyStyles.websiteCard)}
    >
      {image ? (
        <img
          src={image}
          alt={normalizeImageAlt(cardTitle)}
          loading="lazy"
          referrerPolicy="no-referrer"
          {...stylex.props(articleBodyStyles.websiteCardImage)}
        />
      ) : null}
      <WebsiteCardBody
        title={cardTitle}
        description={cardDescription}
        titleRange={titleRange}
        descriptionRange={descriptionRange}
      />
    </a>
  );

  // The quote-highlight tracker has already consumed this block's text above,
  // so swapping in an embed here doesn't shift later blocks' offsets.
  const clientRef = parseBskyClientUrl(src);
  if (clientRef) {
    return (
      <BskyClientEmbedView url={src} clientRef={clientRef} fallback={card} />
    );
  }

  return card;
}
