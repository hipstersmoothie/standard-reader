// Public entry point for @standard-reader/renderer-react.

export {
  StandardDocumentRenderer,
  type StandardDocumentRendererProps,
} from "./render/document";

export { defaultComponents } from "./components/defaults";
export { mergeComponents } from "./components/merge";

// Public prop / option types
export type { TableCell, TableRow } from "./types";

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
