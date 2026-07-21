// Public entry point for @standard-reader/renderer-react.

export {
  StandardDocumentRenderer,
  type StandardDocumentRendererProps,
} from "./render/document";

export { defaultComponents } from "./components/defaults";
export { mergeComponents } from "./components/merge";

// Public prop / option types
export type { TableCell, TableRow } from "./types";
export type {
  StandardSiteDocument,
  RendererOptions,
  ImageUrlResolver,
  AspectRatio,
} from "@standard-reader/renderer-core";
export { defaultImageUrlResolver } from "@standard-reader/renderer-core";

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

// Re-export the framework-agnostic core (parsing, render tree, facet helpers)
// so consumers can pre-process documents without a second dependency.
export {
  buildRenderTree,
  segmentInline,
  leafletBlocks,
  leafletBskyPostUris,
  asLeafletContent,
  LEAFLET_CONTENT,
  pcktBlocks,
  asPcktContent,
  PCKT_CONTENT,
  offprintBlocks,
  OFFPRINT_CONTENT,
  structuredFormatBlocks,
  STRUCTURED_BLOCK_FORMATS,
  isStructuredBlockFormat,
  leafletDocumentContent,
  LEAFLET_DOCUMENT_FORMAT,
  collectLeafletFootnotes,
  segmentFacetedText,
  facetFeatureKind,
  hasFacetKind,
  findFacetFeature,
} from "@standard-reader/renderer-core";
export type {
  DocumentTree,
  BlockNode,
  InlineNode,
  MarkKind,
  RichText,
  FootnoteEntry,
  LeafletRenderableBlock,
  LeafletContent,
  PcktRenderableBlock,
  PcktContent,
  StructuredRenderableBlock,
  StructuredText,
  LeafletFootnote,
} from "@standard-reader/renderer-core";
