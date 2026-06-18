/** Leaflet rich-text facet feature types (`pub.leaflet.richtext.facet#*`). */
export const LEAFLET_FACET = {
  bold: "pub.leaflet.richtext.facet#bold",
  italic: "pub.leaflet.richtext.facet#italic",
  link: "pub.leaflet.richtext.facet#link",
  code: "pub.leaflet.richtext.facet#code",
} as const;

export const LEAFLET_BLOCK = {
  text: "pub.leaflet.blocks.text",
  header: "pub.leaflet.blocks.header",
  blockquote: "pub.leaflet.blocks.blockquote",
  horizontalRule: "pub.leaflet.blocks.horizontalRule",
  unorderedList: "pub.leaflet.blocks.unorderedList",
  unorderedListItem: "pub.leaflet.blocks.unorderedList#listItem",
  orderedList: "pub.leaflet.blocks.orderedList",
  orderedListItem: "pub.leaflet.blocks.orderedList#listItem",
  bskyPost: "pub.leaflet.blocks.bskyPost",
  image: "pub.leaflet.blocks.image",
  code: "pub.leaflet.blocks.code",
  iframe: "pub.leaflet.blocks.iframe",
  website: "pub.leaflet.blocks.website",
  math: "pub.leaflet.blocks.math",
  button: "pub.leaflet.blocks.button",
  poll: "pub.leaflet.blocks.poll",
  page: "pub.leaflet.blocks.page",
  separator: "pub.leaflet.blocks.separator",
  standardSitePost: "pub.leaflet.blocks.standardSitePost",
} as const;

export const LEAFLET_PAGE = {
  linearDocument: "pub.leaflet.pages.linearDocument",
  linearDocumentBlock: "pub.leaflet.pages.linearDocument#block",
  canvas: "pub.leaflet.pages.canvas",
  canvasBlock: "pub.leaflet.pages.canvas#block",
} as const;

export const LEAFLET_CONTENT = "pub.leaflet.content";

export interface LeafletByteRange {
  byteStart: number;
  byteEnd: number;
}

export interface LeafletFacetFeature {
  $type?: string;
  uri?: string;
}

export interface LeafletFacet {
  index: LeafletByteRange;
  features: Array<LeafletFacetFeature>;
}

export interface LeafletTextBlock {
  $type?: string;
  plaintext: string;
  facets?: Array<LeafletFacet>;
}

export type LeafletBlockquoteBlock = LeafletTextBlock;

export interface LeafletHeaderBlock {
  $type?: string;
  level?: number;
  plaintext: string;
}

export interface LeafletBskyPostBlock {
  $type?: string;
  postRef?: { uri?: string; cid?: string };
  clientHost?: string;
}

export interface LeafletImageAspectRatio {
  width?: number;
  height?: number;
}

export interface LeafletImageBlock {
  $type?: string;
  image?: unknown;
  alt?: string;
  aspectRatio?: LeafletImageAspectRatio;
  fullBleed?: boolean;
}

export interface LeafletCodeBlock {
  $type?: string;
  language?: string;
  plaintext: string;
}

export interface LeafletIframeBlock {
  $type?: string;
  url?: string;
  height?: number;
  aspectRatio?: LeafletImageAspectRatio;
}

export interface LeafletWebsiteBlock {
  $type?: string;
  /** Current lexicon field. */
  src?: string;
  /** Legacy field used by older published content. */
  url?: string;
  title?: string;
  description?: string;
  previewImage?: string;
}

export interface LeafletMathBlock {
  $type?: string;
  tex?: string;
}

export interface LeafletButtonBlock {
  $type?: string;
  url?: string;
  text?: string;
}

export interface LeafletPollBlock {
  $type?: string;
  pollRef?: { uri?: string; cid?: string };
}

export interface LeafletPageBlockRef {
  $type?: string;
  id?: string;
}

export interface LeafletStandardSitePostBlock {
  $type?: string;
  uri?: string;
}

export interface LeafletListItem {
  $type?: string;
  content?: LeafletTextBlock | Record<string, unknown>;
  children?: Array<LeafletListItem>;
  unorderedListChildren?: LeafletUnorderedListBlock;
  orderedListChildren?: LeafletOrderedListBlock;
}

export interface LeafletUnorderedListBlock {
  $type?: string;
  children?: Array<LeafletListItem>;
}

export interface LeafletOrderedListBlock {
  $type?: string;
  startIndex?: number;
  children?: Array<LeafletListItem>;
}

export type LeafletRenderableBlock =
  | { kind: "text"; block: LeafletTextBlock }
  | { kind: "header"; block: LeafletHeaderBlock }
  | { kind: "blockquote"; block: LeafletBlockquoteBlock }
  | { kind: "horizontalRule" }
  | { kind: "unorderedList"; block: LeafletUnorderedListBlock }
  | { kind: "orderedList"; block: LeafletOrderedListBlock }
  | { kind: "bskyPost"; block: LeafletBskyPostBlock }
  | { kind: "image"; block: LeafletImageBlock }
  | { kind: "code"; block: LeafletCodeBlock }
  | { kind: "iframe"; block: LeafletIframeBlock }
  | { kind: "website"; block: LeafletWebsiteBlock }
  | { kind: "math"; block: LeafletMathBlock }
  | { kind: "button"; block: LeafletButtonBlock }
  | { kind: "poll"; block: LeafletPollBlock }
  | { kind: "separator" }
  | { kind: "standardSitePost"; block: LeafletStandardSitePostBlock }
  | {
      kind: "pageEmbed";
      pageId: string;
      pageType?: string;
      blocks: Array<LeafletRenderableBlock>;
    }
  | { kind: "unknown"; blockType: string };

export interface LeafletPageBlock {
  $type?: string;
  block?: LeafletTextBlock | Record<string, unknown>;
}

export interface LeafletLinearPage {
  $type?: string;
  id?: string;
  blocks?: Array<LeafletPageBlock>;
}

export interface LeafletContent {
  $type?: string;
  pages?: Array<LeafletLinearPage>;
  /** Out-of-record JSON blob holding `pages` when inline `pages` is empty. */
  blobPages?: unknown;
  blobs?: Array<unknown>;
}
