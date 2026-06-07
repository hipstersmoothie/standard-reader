"use client";

import type { StructuredText } from "#/lib/document/structured-content/types";

import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "../body-styles";
import { FacetedPlaintext } from "./shared/faceted-text";

export function StructuredBulletListView({
  items,
}: {
  items: Array<StructuredText>;
}) {
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

export function StructuredOrderedListView({
  items,
  start,
}: {
  items: Array<StructuredText>;
  start?: number;
}) {
  if (items.length === 0) return null;

  return (
    <ol {...stylex.props(articleBodyStyles.list)} start={start ?? 1}>
      {items.map((item, index) => (
        <li key={index} {...stylex.props(articleBodyStyles.listItem)}>
          <FacetedPlaintext plaintext={item.plaintext} facets={item.facets} />
        </li>
      ))}
    </ol>
  );
}

export function StructuredTaskListView({
  items,
}: {
  items: Array<{ checked?: boolean; text: StructuredText }>;
}) {
  if (items.length === 0) return null;

  return (
    <ul {...stylex.props(articleBodyStyles.taskList)}>
      {items.map((item, index) => (
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
            <FacetedPlaintext
              plaintext={item.text.plaintext}
              facets={item.text.facets}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StructuredTableView({
  rows,
}: {
  rows: Array<Array<{ isHeader?: boolean; text: StructuredText }>>;
}) {
  if (rows.length === 0) return null;

  return (
    <table {...stylex.props(articleBodyStyles.table)}>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.map((cell, cellIndex) => {
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
                  <FacetedPlaintext
                    plaintext={cell.text.plaintext}
                    facets={cell.text.facets}
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
  const cardTitle = title?.trim();
  const cardDescription = description?.trim();
  const image = previewImage?.trim();

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
            {cardTitle}
          </p>
        ) : null}
        {cardDescription ? (
          <p {...stylex.props(articleBodyStyles.websiteCardDescription)}>
            {cardDescription}
          </p>
        ) : null}
      </div>
    </a>
  );
}
