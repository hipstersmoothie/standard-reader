import { useMemo, type ReactNode } from "react";

import {
  ComponentsProvider,
  DocumentProvider,
  FootnoteNumbersProvider,
  type DocumentContextValue,
} from "../components/context";
import { mergeComponents } from "../components/merge";
import type {
  RendererComponents,
  RendererComponentsInput,
} from "../components/types";
import {
  LEAFLET_DOCUMENT_FORMAT,
  leafletDocumentContent,
  structuredFormatBlocks,
} from "../core/document/content-formats";
import type { StructuredRenderableBlock } from "../core/document/structured-content/types";
import { leafletBlocks } from "../core/leaflet/blocks";
import { collectLeafletFootnotes } from "../core/leaflet/footnotes";
import { LEAFLET_CONTENT } from "../core/leaflet/types";
import { offprintBlocks } from "../core/offprint/blocks";
import { OFFPRINT_CONTENT } from "../core/offprint/types";
import { pcktBlocks } from "../core/pckt/blocks";
import { PCKT_CONTENT } from "../core/pckt/types";
import type { RendererOptions, StandardSiteDocument } from "../types";
import { defaultImageUrlResolver } from "./image";
import { LeafletBlockList } from "./leaflet";
import { PcktBlockList } from "./pckt";
import { StructuredBlockList } from "./structured";

export interface StandardDocumentRendererProps {
  /** The Standard Site document to render. */
  document: StandardSiteDocument;
  /** Component overrides. Anything omitted uses the unstyled defaults. */
  components?: RendererComponentsInput;
  /** Rendering options (drop cap, leading-image handling, image URLs). */
  options?: RendererOptions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveFormat(doc: StandardSiteDocument): string | null {
  if (isRecord(doc.content) && typeof doc.content.$type === "string") {
    return doc.content.$type;
  }
  return doc.contentFormat ?? null;
}

/**
 * The block parsers key off `content.$type`. When the format is only known via
 * `contentFormat` (the payload omits `$type`), stamp it on so the parsers see a
 * tagged union.
 */
function ensureType(content: unknown, format: string): unknown {
  if (isRecord(content) && typeof content.$type !== "string") {
    return { ...content, $type: format };
  }
  return content;
}

/**
 * Headless renderer for a Standard Site document. Supply the `document` and,
 * optionally, a `components` map to control how each block and inline mark is
 * rendered. With no `components`, the document renders as unstyled semantic
 * HTML.
 */
export function StandardDocumentRenderer({
  document: doc,
  components,
  options,
}: StandardDocumentRendererProps) {
  const merged = useMemo(() => mergeComponents(components), [components]);

  const docContext = useMemo<DocumentContextValue>(
    () => ({
      authorDid: doc.authorDid,
      resolveImageUrl: options?.resolveImageUrl ?? defaultImageUrlResolver,
      dropCap: options?.dropCap ?? false,
    }),
    [doc.authorDid, options?.resolveImageUrl, options?.dropCap],
  );

  const body = renderBody(doc, merged, options);
  if (!body) return null;

  return (
    <ComponentsProvider value={merged}>
      <DocumentProvider value={docContext}>{body}</DocumentProvider>
    </ComponentsProvider>
  );
}

function renderBody(
  doc: StandardSiteDocument,
  components: RendererComponents,
  options: RendererOptions | undefined,
): ReactNode {
  const format = resolveFormat(doc);
  if (!format) return null;

  const content = ensureType(doc.content, format);
  const { Root } = components.shared;
  const dropCap = options?.dropCap ?? false;
  const skipLeadingImage = options?.skipLeadingImage ?? false;
  const description = doc.description ?? undefined;

  if (format === LEAFLET_CONTENT || format === LEAFLET_DOCUMENT_FORMAT) {
    const source =
      format === LEAFLET_DOCUMENT_FORMAT
        ? leafletDocumentContent(content)
        : content;
    let blocks = leafletBlocks(source);
    blocks = dropLeadingImage(
      blocks,
      skipLeadingImage,
      (b) => b.kind === "image",
    );
    blocks = dropLeadingHeading(blocks, description, (b) =>
      b.kind === "header" ? b.block.plaintext : null,
    );
    if (blocks.length === 0) return null;

    const dropCapIndex = dropCap
      ? blocks.findIndex((b) => b.kind === "text" && b.block.plaintext.trim())
      : -1;
    const { footnotes, numberById } = collectLeafletFootnotes(blocks);

    return (
      <Root>
        <FootnoteNumbersProvider value={numberById}>
          <LeafletBlockList blocks={blocks} dropCapIndex={dropCapIndex} />
          {footnotes.length > 0 ? (
            <components.shared.Footnotes>
              {footnotes.map((footnote) => (
                <components.shared.FootnoteItem
                  key={footnote.id}
                  id={footnote.id}
                  number={footnote.number}
                >
                  <components.shared.FacetText
                    plaintext={footnote.contentPlaintext}
                    facets={footnote.contentFacets}
                  />
                </components.shared.FootnoteItem>
              ))}
            </components.shared.Footnotes>
          ) : null}
        </FootnoteNumbersProvider>
      </Root>
    );
  }

  if (format === PCKT_CONTENT) {
    let blocks = pcktBlocks(content);
    blocks = dropLeadingImage(
      blocks,
      skipLeadingImage,
      (b) => b.kind === "image",
    );
    blocks = dropLeadingHeading(blocks, description, (b) =>
      b.kind === "heading" ? b.block.plaintext : null,
    );
    if (blocks.length === 0) return null;
    const dropCapIndex = dropCap
      ? blocks.findIndex(
          (b) => b.kind === "text" && b.block.plaintext.trim().length > 0,
        )
      : -1;
    return (
      <Root>
        <PcktBlockList blocks={blocks} dropCapIndex={dropCapIndex} />
      </Root>
    );
  }

  // Offprint + third-party structured formats share one vocabulary.
  const structured: Array<StructuredRenderableBlock> | null =
    format === OFFPRINT_CONTENT
      ? offprintBlocks(content)
      : structuredFormatBlocks(content, format);
  if (structured) {
    let blocks = structured;
    blocks = dropLeadingImage(
      blocks,
      skipLeadingImage,
      (b) => b.kind === "image",
    );
    blocks = dropLeadingHeading(blocks, description, (b) =>
      b.kind === "heading" ? b.text.plaintext : null,
    );
    if (blocks.length === 0) return null;
    const dropCapIndex = dropCap
      ? blocks.findIndex(
          (b) => b.kind === "text" && b.text.plaintext.trim().length > 0,
        )
      : -1;
    return (
      <Root>
        <StructuredBlockList blocks={blocks} dropCapIndex={dropCapIndex} />
      </Root>
    );
  }

  return null;
}

function dropLeadingImage<T>(
  blocks: Array<T>,
  skip: boolean,
  isImage: (block: T) => boolean,
): Array<T> {
  if (!skip || blocks.length === 0) return blocks;
  return isImage(blocks[0] as T) ? blocks.slice(1) : blocks;
}

function dropLeadingHeading<T>(
  blocks: Array<T>,
  description: string | undefined,
  headingText: (block: T) => string | null,
): Array<T> {
  const desc = description?.trim();
  if (!desc || blocks.length === 0) return blocks;
  const first = headingText(blocks[0] as T);
  return first != null && first.trim() === desc ? blocks.slice(1) : blocks;
}
