import type { ComponentType, ReactNode } from "react";

import type { AspectRatio, TableRow } from "../types";

/**
 * Components come in two categories:
 *
 * - **Shared** components render the block and inline vocabulary that every
 *   content format has in common (paragraphs, headings, images, code, lists,
 *   inline marks, …). Override these once and they apply across Leaflet, pckt,
 *   Offprint and every third-party format.
 * - **Platform** components render the blocks unique to a single publishing
 *   platform (a Leaflet poll, a pckt gallery, an Offprint component, …). These
 *   are the interactive, often data-backed embeds; the headless defaults render
 *   inert placeholders, so supply your own to make them live.
 */

// ---------------------------------------------------------------------------
// Inline (facet) components — shared
// ---------------------------------------------------------------------------

export interface MentionProps {
  /** AT-URI target of an `atMention` (e.g. a publication or document record). */
  atUri?: string;
  /** DID target of a `didMention`. */
  did?: string;
  /** The mention's display text. */
  children: ReactNode;
}

export interface FacetLinkProps {
  href: string;
  children: ReactNode;
}

export interface FootnoteReferenceProps {
  /** Stable id shared by the inline reference and the endnote entry. */
  footnoteId: string;
  /** 1-based display number, or `null` when the note has no registered entry. */
  number: number | null;
  /** The footnote body as plaintext, for a hover preview. */
  contentPlaintext?: string;
}

export interface MarkProps {
  children: ReactNode;
}

export interface FacetTextProps {
  plaintext: string;
  /** Raw AT-Proto facets (byte-indexed), in any supported format's dialect. */
  facets?: Array<unknown>;
}

/** The inline components applied to spans of rich text. */
export interface InlineComponents {
  /** Top-level renderer for a run of faceted plaintext. Override this to take
   *  full control of inline formatting; otherwise it composes the marks below. */
  FacetText: ComponentType<FacetTextProps>;
  Strong: ComponentType<MarkProps>;
  Emphasis: ComponentType<MarkProps>;
  InlineCode: ComponentType<MarkProps>;
  Underline: ComponentType<MarkProps>;
  Strikethrough: ComponentType<MarkProps>;
  Highlight: ComponentType<MarkProps>;
  Link: ComponentType<FacetLinkProps>;
  Mention: ComponentType<MentionProps>;
  FootnoteReference: ComponentType<FootnoteReferenceProps>;
}

// ---------------------------------------------------------------------------
// Block components — shared
// ---------------------------------------------------------------------------

export interface RootProps {
  children: ReactNode;
}

export interface ParagraphProps {
  children: ReactNode;
  /** True for the body's first paragraph when drop caps are enabled. */
  dropCap?: boolean;
}

export interface HeadingProps {
  /** 1–6. */
  level: number;
  children: ReactNode;
}

export interface BlockquoteProps {
  /** One rendered paragraph per quoted line. */
  children: ReactNode;
}

export interface CalloutProps {
  emoji?: string;
  color?: string;
  children: ReactNode;
}

export interface ListProps {
  children: ReactNode;
}

export interface OrderedListProps {
  start?: number;
  children: ReactNode;
}

export interface ListItemProps {
  children: ReactNode;
}

export interface TaskListItemProps {
  checked?: boolean;
  children: ReactNode;
}

export interface CodeProps {
  code: string;
  language?: string;
}

export interface ImageProps {
  src: string;
  alt: string;
  aspectRatio?: AspectRatio;
  /** Leaflet full-bleed images request edge-to-edge layout. */
  fullBleed?: boolean;
  /** Optional caption (defaults to the alt text where the platform uses it). */
  caption?: string;
}

export interface IframeProps {
  url: string;
  height?: number;
  aspectRatio?: { width?: number; height?: number };
}

export interface WebsiteProps {
  src: string;
  title?: string;
  description?: string;
  previewImage?: string;
}

export interface TableProps {
  rows: Array<TableRow>;
}

export interface MathProps {
  tex: string;
}

export interface ButtonProps {
  text: string;
  href: string;
  caption?: string;
  alignment?: string;
}

export interface BlueskyEmbedProps {
  postUri: string;
}

export interface ImageCollectionImage {
  src: string;
  alt: string;
  aspectRatio?: AspectRatio;
}

export interface ImageCollectionProps {
  images: Array<ImageCollectionImage>;
  caption?: string;
  /** "grid" | "carousel" — the layout the source requested. */
  layout?: string;
}

export interface ImageDiffProps {
  before: ImageCollectionImage;
  after: ImageCollectionImage;
  caption?: string;
  labels?: [string?, string?];
}

export interface FootnotesProps {
  children: ReactNode;
}

export interface FootnoteItemProps {
  id: string;
  number: number;
  children: ReactNode;
}

export interface UnknownBlockProps {
  blockType: string;
}

/** The block components shared by every content format. */
export interface SharedBlockComponents {
  /** Wraps the whole rendered body. */
  Root: ComponentType<RootProps>;
  Paragraph: ComponentType<ParagraphProps>;
  Heading: ComponentType<HeadingProps>;
  Blockquote: ComponentType<BlockquoteProps>;
  Callout: ComponentType<CalloutProps>;
  HorizontalRule: ComponentType<Record<string, never>>;
  BulletList: ComponentType<ListProps>;
  OrderedList: ComponentType<OrderedListProps>;
  ListItem: ComponentType<ListItemProps>;
  TaskList: ComponentType<ListProps>;
  TaskListItem: ComponentType<TaskListItemProps>;
  Code: ComponentType<CodeProps>;
  Image: ComponentType<ImageProps>;
  Iframe: ComponentType<IframeProps>;
  Website: ComponentType<WebsiteProps>;
  Table: ComponentType<TableProps>;
  Math: ComponentType<MathProps>;
  Button: ComponentType<ButtonProps>;
  BlueskyEmbed: ComponentType<BlueskyEmbedProps>;
  ImageGrid: ComponentType<ImageCollectionProps>;
  ImageCarousel: ComponentType<ImageCollectionProps>;
  ImageDiff: ComponentType<ImageDiffProps>;
  Footnotes: ComponentType<FootnotesProps>;
  FootnoteItem: ComponentType<FootnoteItemProps>;
  Unknown: ComponentType<UnknownBlockProps>;
}

export type SharedComponents = SharedBlockComponents & InlineComponents;

// ---------------------------------------------------------------------------
// Platform components
// ---------------------------------------------------------------------------

export interface LeafletPollProps {
  /** AT-URI of the poll record. */
  pollUri: string;
}

export interface LeafletStandardSitePostProps {
  /** AT-URI of the embedded `site.standard.document`. */
  uri: string;
}

export interface LeafletStandardSitePublicationProps {
  /** AT-URI of the embedded `site.standard.publication`. */
  uri: string;
  cid?: string;
  showPublicationTheme?: boolean;
}

export interface LeafletPageEmbedProps {
  pageId: string;
  pageType?: string;
  /** The embedded page's rendered blocks. */
  children: ReactNode;
}

export interface LeafletComponents {
  Poll: ComponentType<LeafletPollProps>;
  Signup: ComponentType<Record<string, never>>;
  Separator: ComponentType<Record<string, never>>;
  StandardSitePost: ComponentType<LeafletStandardSitePostProps>;
  StandardSitePublication: ComponentType<LeafletStandardSitePublicationProps>;
  PageEmbed: ComponentType<LeafletPageEmbedProps>;
}

export interface PcktGalleryProps {
  /** AT-URI of the gallery blob record. */
  ref: string;
}

export interface PcktNoteEmbedProps {
  /** AT-URI of the embedded `blog.pckt.mini.post`. */
  uri?: string;
  cid?: string;
}

export interface PcktComponents {
  Gallery: ComponentType<PcktGalleryProps>;
  NoteEmbed: ComponentType<PcktNoteEmbedProps>;
}

export interface OffprintComponentProps {
  /** AT-URI of the `app.offprint.component` record to resolve on read. */
  componentUri: string;
}

export interface OffprintComponents {
  Component: ComponentType<OffprintComponentProps>;
}

// ---------------------------------------------------------------------------
// Aggregate registry
// ---------------------------------------------------------------------------

/** The fully-resolved component registry used internally after merging. */
export interface RendererComponents {
  shared: SharedComponents;
  leaflet: LeafletComponents;
  pckt: PcktComponents;
  offprint: OffprintComponents;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K];
};

/**
 * The `components` prop shape: override any subset of components; everything
 * else falls back to the unstyled defaults.
 */
export type RendererComponentsInput = DeepPartial<RendererComponents>;
