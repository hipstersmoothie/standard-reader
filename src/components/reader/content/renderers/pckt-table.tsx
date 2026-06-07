"use client";

import type { PcktTableBlock } from "#/lib/pckt/types";

import * as stylex from "@stylexjs/stylex";
import { useQuoteHighlightTracker } from "#/components/reader/quote-highlight-context";
import { asTextBlock } from "#/lib/pckt/blocks";
import { PCKT_BLOCK } from "#/lib/pckt/types";

import { articleBodyStyles } from "../body-styles";
import { HighlightedFacetedPlaintext } from "./shared/faceted-text";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function TableCellContent({
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
        if (!text?.plaintext.trim()) return null;
        const highlightRange = tracker?.consume(text.plaintext.length) ?? null;
        return (
          <HighlightedFacetedPlaintext
            key={index}
            plaintext={text.plaintext}
            facets={text.facets}
            highlightRange={highlightRange}
          />
        );
      })}
    </>
  );
}

export function PcktTableBlockView({ block }: { block: PcktTableBlock }) {
  const rows = block.content ?? [];
  if (rows.length === 0) return null;

  return (
    <table {...stylex.props(articleBodyStyles.table)}>
      <tbody>
        {rows.map((row, rowIndex) => {
          if (!isRecord(row)) return null;
          const cells = row.content as
            | Array<Record<string, unknown>>
            | undefined;
          if (!cells?.length) return null;

          return (
            <tr key={rowIndex}>
              {cells.map((cell, cellIndex) => {
                if (!isRecord(cell)) return null;
                const isHeader = cell.$type === PCKT_BLOCK.tableHeader;
                const CellTag = isHeader ? "th" : "td";
                const cellContent = cell.content as
                  | Array<Record<string, unknown>>
                  | undefined;

                return (
                  <CellTag
                    key={cellIndex}
                    {...stylex.props(
                      articleBodyStyles.tableCell,
                      isHeader ? articleBodyStyles.tableHeaderCell : undefined,
                    )}
                  >
                    <TableCellContent content={cellContent} />
                  </CellTag>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
