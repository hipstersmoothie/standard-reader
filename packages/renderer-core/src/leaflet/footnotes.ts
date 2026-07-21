import { isRecord } from "../internal";
import { asTextBlock } from "./blocks";
import type {
  LeafletFacet,
  LeafletFacetFeature,
  LeafletRenderableBlock,
} from "./types";
import { LEAFLET_FACET } from "./types";

/**
 * A single footnote referenced somewhere in the document body. Leaflet stores
 * footnotes inline on the rich-text facet feature (`#footnote`) that marks the
 * reference — the body isn't a separate block — so we collect them up front to
 * assign stable, sequential numbers and render an endnotes list.
 */
export interface LeafletFootnote {
  /** `footnoteId` from the facet feature — shared by the reference + entry. */
  id: string;
  /** 1-based display number in document order. */
  number: number;
  contentPlaintext: string;
  contentFacets?: Array<LeafletFacet>;
}

export interface LeafletFootnoteIndex {
  /** Footnotes in document order, deduped by id. */
  footnotes: Array<LeafletFootnote>;
  /** `footnoteId` → display number, for the inline reference renderer. */
  numberById: Map<string, number>;
}

interface RawFootnote {
  id: string;
  contentPlaintext: string;
  contentFacets?: Array<LeafletFacet>;
}

function asFootnoteFeature(feature: unknown): RawFootnote | null {
  if (!isRecord(feature)) return null;
  if (feature.$type !== LEAFLET_FACET.footnote) return null;
  const id = feature.footnoteId;
  if (typeof id !== "string" || id.length === 0) return null;
  const contentPlaintext =
    typeof feature.contentPlaintext === "string"
      ? feature.contentPlaintext
      : "";
  const contentFacets = Array.isArray(feature.contentFacets)
    ? (feature.contentFacets as Array<LeafletFacet>)
    : undefined;
  return {
    id,
    contentPlaintext,
    ...(contentFacets ? { contentFacets } : {}),
  };
}

function facetByteStart(facet: unknown): number {
  if (isRecord(facet) && isRecord(facet.index)) {
    const start = facet.index.byteStart;
    if (typeof start === "number") return start;
  }
  return 0;
}

/**
 * Pull footnote features out of one block's facets, in byte order so numbering
 * follows reading order within the block.
 */
function collectFromFacets(
  facets: Array<LeafletFacet> | Array<unknown> | undefined,
  out: Array<RawFootnote>,
): void {
  if (!Array.isArray(facets) || facets.length === 0) return;
  const sorted = [...facets].toSorted(
    (a, b) => facetByteStart(a) - facetByteStart(b),
  );
  for (const facet of sorted) {
    if (!isRecord(facet) || !Array.isArray(facet.features)) continue;
    for (const feature of facet.features as Array<LeafletFacetFeature>) {
      const footnote = asFootnoteFeature(feature);
      if (footnote) out.push(footnote);
    }
  }
}

/** Walk list items (and their nested lists) reading footnotes off each item. */
function collectFromListItems(items: unknown, out: Array<RawFootnote>): void {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!isRecord(item)) continue;
    const content = asTextBlock(item.content);
    if (content) collectFromFacets(content.facets, out);
    collectFromListItems(item.children, out);
    if (isRecord(item.unorderedListChildren)) {
      collectFromListItems(item.unorderedListChildren.children, out);
    }
    if (isRecord(item.orderedListChildren)) {
      collectFromListItems(item.orderedListChildren.children, out);
    }
  }
}

function collectFromBlock(
  block: LeafletRenderableBlock,
  out: Array<RawFootnote>,
): void {
  switch (block.kind) {
    case "text":
    case "header":
    case "blockquote": {
      collectFromFacets(block.block.facets, out);
      return;
    }
    case "unorderedList":
    case "orderedList": {
      collectFromListItems(block.block.children, out);
      return;
    }
    case "pageEmbed": {
      for (const nested of block.blocks) collectFromBlock(nested, out);
      return;
    }
    default: {
      return;
    }
  }
}

/**
 * Collect every footnote in the document, numbered in reading order and deduped
 * by id (a footnote referenced twice keeps one entry / one number). Returns both
 * the ordered list (for the endnotes section) and an id→number map (for the
 * inline superscript references).
 */
export function collectLeafletFootnotes(
  blocks: Array<LeafletRenderableBlock>,
): LeafletFootnoteIndex {
  const raw: Array<RawFootnote> = [];
  for (const block of blocks) collectFromBlock(block, raw);

  const numberById = new Map<string, number>();
  const footnotes: Array<LeafletFootnote> = [];
  for (const footnote of raw) {
    if (numberById.has(footnote.id)) continue;
    const number = footnotes.length + 1;
    numberById.set(footnote.id, number);
    footnotes.push({ ...footnote, number });
  }
  return { footnotes, numberById };
}
