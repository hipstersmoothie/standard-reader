// Public entry point for @standard-reader/renderer-core — the framework-agnostic
// parsing + normalized render tree that every UI-framework renderer builds on.

// The normalized render tree + inline segmentation
export { buildRenderTree } from "./build";
export { segmentInline, richTextIsEmpty } from "./inline";
export type {
  DocumentTree,
  BlockNode,
  InlineNode,
  MarkKind,
  RichText,
  ListItem,
  TaskItem,
  TableCell,
  TableRow,
  CollectionImage,
  FootnoteEntry,
} from "./nodes";

// Document input + options
export type {
  StandardSiteDocument,
  RendererOptions,
  ImageUrlResolver,
  AspectRatio,
} from "./types";

// Image resolution
export { defaultImageUrlResolver, resolveGridImages } from "./image";
export { blobCid, cdnImageUrl } from "./atproto/blob";
export type { BlobRef } from "./atproto/blob";

// Pure block-vocabulary parsers + types
export {
  leafletBlocks,
  leafletBskyPostUris,
  asLeafletContent,
} from "./leaflet/blocks";
export type { LeafletRenderableBlock, LeafletContent } from "./leaflet/types";
export { LEAFLET_CONTENT } from "./leaflet/types";

export { pcktBlocks, asPcktContent } from "./pckt/blocks";
export type { PcktRenderableBlock, PcktContent } from "./pckt/types";
export { PCKT_CONTENT } from "./pckt/types";

export { offprintBlocks } from "./offprint/blocks";
export { OFFPRINT_CONTENT } from "./offprint/types";

export {
  structuredFormatBlocks,
  STRUCTURED_BLOCK_FORMATS,
  isStructuredBlockFormat,
  leafletDocumentContent,
  LEAFLET_DOCUMENT_FORMAT,
} from "./document/content-formats";
export type {
  StructuredRenderableBlock,
  StructuredText,
} from "./document/structured-content/types";

export { collectLeafletFootnotes } from "./leaflet/footnotes";
export type { LeafletFootnote } from "./leaflet/footnotes";

// Facet helpers
export { segmentFacetedText } from "./leaflet/facets";
export { facetFeatureKind, hasFacetKind, findFacetFeature } from "./facets";
