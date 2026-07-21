// Public entry point for @standard-reader/renderer-react.

export {
  StandardDocumentRenderer,
  type StandardDocumentRendererProps,
} from "./render/document";

export { defaultComponents } from "./components/defaults";
export { mergeComponents } from "./components/merge";
export { defaultImageUrlResolver } from "./render/image";

// Public prop / option types
export type {
  StandardSiteDocument,
  RendererOptions,
  ImageUrlResolver,
  AspectRatio,
  TableCell,
  TableRow,
} from "./types";

// Component contracts (for typing custom components)
export type {
  RendererComponents,
  RendererComponentsInput,
  SharedComponents,
  SharedBlockComponents,
  InlineComponents,
  LeafletComponents,
  PcktComponents,
  OffprintComponents,
  // Inline props
  FacetTextProps,
  MarkProps,
  FacetLinkProps,
  MentionProps,
  FootnoteReferenceProps,
  // Shared block props
  RootProps,
  ParagraphProps,
  HeadingProps,
  BlockquoteProps,
  CalloutProps,
  ListProps,
  OrderedListProps,
  ListItemProps,
  TaskListItemProps,
  CodeProps,
  ImageProps,
  IframeProps,
  WebsiteProps,
  TableProps,
  MathProps,
  ButtonProps,
  BlueskyEmbedProps,
  ImageCollectionProps,
  ImageCollectionImage,
  ImageDiffProps,
  FootnotesProps,
  FootnoteItemProps,
  UnknownBlockProps,
  // Platform props
  LeafletPollProps,
  LeafletStandardSitePostProps,
  LeafletStandardSitePublicationProps,
  LeafletPageEmbedProps,
  PcktGalleryProps,
  PcktNoteEmbedProps,
  OffprintComponentProps,
} from "./components/types";

// Block-vocabulary types + pure parsers, for consumers that want to
// pre-process or inspect documents outside the renderer.
export {
  leafletBlocks,
  leafletBskyPostUris,
  asLeafletContent,
} from "./core/leaflet/blocks";
export type {
  LeafletRenderableBlock,
  LeafletContent,
} from "./core/leaflet/types";
export { LEAFLET_CONTENT } from "./core/leaflet/types";

export { pcktBlocks, asPcktContent } from "./core/pckt/blocks";
export type { PcktRenderableBlock, PcktContent } from "./core/pckt/types";
export { PCKT_CONTENT } from "./core/pckt/types";

export { offprintBlocks } from "./core/offprint/blocks";
export { OFFPRINT_CONTENT } from "./core/offprint/types";

export {
  structuredFormatBlocks,
  STRUCTURED_BLOCK_FORMATS,
  isStructuredBlockFormat,
  leafletDocumentContent,
  LEAFLET_DOCUMENT_FORMAT,
} from "./core/document/content-formats";
export type {
  StructuredRenderableBlock,
  StructuredText,
} from "./core/document/structured-content/types";

export { collectLeafletFootnotes } from "./core/leaflet/footnotes";
export type { LeafletFootnote } from "./core/leaflet/footnotes";

export { segmentFacetedText } from "./core/leaflet/facets";
export {
  facetFeatureKind,
  hasFacetKind,
  findFacetFeature,
} from "./core/facets";
