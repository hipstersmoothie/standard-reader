// Public entry point for @standard-reader/renderer-core — the framework-agnostic
// parsing + normalized render tree that every UI-framework renderer builds on.

// The normalized render tree + inline segmentation
export { buildRenderTree } from "./build.js";
export { segmentInline, richTextIsEmpty } from "./inline.js";
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
  ImageSource,
} from "./nodes.js";

// Document input + options
export type {
  StandardSiteDocument,
  RendererOptions,
  ImageUrlResolver,
  AspectRatio,
} from "./types.js";

// Image resolution
export { defaultImageUrlResolver, resolveGridImages } from "./image.js";
export { blobCid, cdnImageUrl } from "./atproto/blob.js";
export type { BlobRef } from "./atproto/blob.js";

// Pure block-vocabulary parsers + types
export {
  leafletBlocks,
  leafletBskyPostUris,
  asLeafletContent,
} from "./leaflet/blocks.js";
export type {
  LeafletRenderableBlock,
  LeafletContent,
} from "./leaflet/types.js";
export { LEAFLET_CONTENT } from "./leaflet/types.js";

export { pcktBlocks, asPcktContent } from "./pckt/blocks.js";
export type { PcktRenderableBlock, PcktContent } from "./pckt/types.js";
export { PCKT_CONTENT } from "./pckt/types.js";

export { offprintBlocks } from "./offprint/blocks.js";
export { OFFPRINT_CONTENT } from "./offprint/types.js";

export {
  structuredFormatBlocks,
  STRUCTURED_BLOCK_FORMATS,
  isStructuredBlockFormat,
  leafletDocumentContent,
  LEAFLET_DOCUMENT_FORMAT,
} from "./document/content-formats.js";
export {
  markdownBlocks,
  markdownBlocksFromText,
  markdownText,
  isMarkdownFormat,
  MARKDOWN_FORMATS,
} from "./document/structured-content/markdown.js";
export type { MarkdownFlavor } from "./document/structured-content/markdown.js";
export {
  markpubBlocks,
  prepareMarkpubMarkdown,
  parseMarkpubContent,
  isMarkpubFormat,
  MARKPUB_FORMATS,
  MARKPUB_MARKDOWN,
  MARKPUB_TEXT,
} from "./document/structured-content/markpub.js";
export type {
  MarkpubDocument,
  PreparedMarkpubMarkdown,
} from "./document/structured-content/markpub.js";
export {
  gutenbergBlocks,
  GUTENBERG_CONTENT,
} from "./document/structured-content/gutenberg.js";
export type {
  StructuredRenderableBlock,
  StructuredText,
} from "./document/structured-content/types.js";

export { collectLeafletFootnotes } from "./leaflet/footnotes.js";
export type { LeafletFootnote } from "./leaflet/footnotes.js";

// Facet helpers
export { segmentFacetedText } from "./leaflet/facets.js";
export { facetFeatureKind, hasFacetKind, findFacetFeature } from "./facets.js";
