"use client";

import type { StructuredText } from "#/lib/document/structured-content/types";

import * as stylex from "@stylexjs/stylex";
import {
  HighlightedPlaintext,
  useQuoteHighlightTracker,
} from "#/components/reader/quote-highlight-context";

import { articleBodyStyles } from "../body-styles";
import { HighlightedFacetedPlaintext } from "./shared/faceted-text";

export function StructuredBulletListView({
  items,
}: {
  items: Array<StructuredText>;
}) {
  const tracker = useQuoteHighlightTracker();
  if (items.length === 0) return null;

  return (
    <ul {...stylex.props(articleBodyStyles.list)}>
      {items.map((item, index) => {
        const highlightRange = tracker?.consume(item.plaintext.length) ?? null;
        return (
          <li key={index} {...stylex.props(articleBodyStyles.listItem)}>
            <HighlightedFacetedPlaintext
              plaintext={item.plaintext}
              facets={item.facets}
              highlightRange={highlightRange}
            />
          </li>
        );
      })}
    </ul>
  );
}

export function StructuredOrderedListView({
  items,
  start,
}: {
  items: Array<StructuredText>;
  start?: number;
}) {
  const tracker = useQuoteHighlightTracker();
  if (items.length === 0) return null;

  return (
    <ol {...stylex.props(articleBodyStyles.list)} start={start ?? 1}>
      {items.map((item, index) => {
        const highlightRange = tracker?.consume(item.plaintext.length) ?? null;
        return (
          <li key={index} {...stylex.props(articleBodyStyles.listItem)}>
            <HighlightedFacetedPlaintext
              plaintext={item.plaintext}
              facets={item.facets}
              highlightRange={highlightRange}
            />
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

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      {...stylex.props(articleBodyStyles.websiteCard)}
    >
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          {...stylex.props(articleBodyStyles.websiteCardImage)}
        />
      ) : null}
      <div {...stylex.props(articleBodyStyles.websiteCardBody)}>
        {cardTitle ? (
          <p {...stylex.props(articleBodyStyles.websiteCardTitle)}>
            <HighlightedPlaintext
              plaintext={cardTitle}
              highlightRange={titleRange}
            />
          </p>
        ) : null}
        {cardDescription ? (
          <p {...stylex.props(articleBodyStyles.websiteCardDescription)}>
            <HighlightedPlaintext
              plaintext={cardDescription}
              highlightRange={descriptionRange}
            />
          </p>
        ) : null}
      </div>
    </a>
  );
}
