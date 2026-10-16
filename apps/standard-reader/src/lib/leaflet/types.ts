/** Leaflet rich-text facet feature types (`pub.leaflet.richtext.facet#*`). */
export const LEAFLET_FACET = {
  bold: "pub.leaflet.richtext.facet#bold",
  italic: "pub.leaflet.richtext.facet#italic",
  link: "pub.leaflet.richtext.facet#link",
  code: "pub.leaflet.richtext.facet#code",
  /** Inline reference to a repo record — e.g. a `site.standard.publication`. */
  atMention: "pub.leaflet.richtext.facet#atMention",
  /** Inline reference to an actor by DID. */
  didMention: "pub.leaflet.richtext.facet#didMention",
  /** Inline footnote reference; the footnote body rides on the feature itself. */
  footnote: "pub.leaflet.richtext.facet#footnote",
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
  html: "pub.leaflet.blocks.html",
  iframe: "pub.leaflet.blocks.iframe",
  website: "pub.leaflet.blocks.website",
  math: "pub.leaflet.blocks.math",
  button: "pub.leaflet.blocks.button",
  poll: "pub.leaflet.blocks.poll",
  page: "pub.leaflet.blocks.page",
  separator: "pub.leaflet.blocks.separator",
  standardSitePost: "pub.leaflet.blocks.standardSitePost",
  standardSitePublication: "pub.leaflet.blocks.standardSitePublication",
  imageGallery: "pub.leaflet.blocks.imageGallery",
  imageGalleryImage: "pub.leaflet.blocks.imageGallery#image",
  signup: "pub.leaflet.blocks.signup",
  drawing: "pub.leaflet.blocks.drawing",
  embeddedCanvas: "pub.leaflet.blocks.embeddedCanvas",
  membersOnlyDelimiter: "pub.leaflet.blocks.membersOnlyDelimiter",
  postHeader: "pub.leaflet.blocks.postHeader",
  postsList: "pub.leaflet.blocks.postsList",
  questions: "pub.leaflet.blocks.questions",
  recommendedPubs: "pub.leaflet.blocks.recommendedPubs",
  reply: "pub.leaflet.blocks.reply",
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
  /** `#atMention` target — an AT-URI (e.g. a `site.standard.publication`). */
  atURI?: string;
  /** `#didMention` target DID. */
  did?: string;
  /** `#footnote` — stable id shared by the inline reference and its entry. */
  footnoteId?: string;
  /** `#footnote` — the footnote body as plaintext. */
  contentPlaintext?: string;
  /** `#footnote` — rich-text facets over `contentPlaintext` (byte offsets). */
  contentFacets?: Array<LeafletFacet>;
}

export interface LeafletFacet {
  index: LeafletByteRange;
  features: Array<LeafletFacetFeature>;
}

export interface LeafletTextBlock {
  $type?: string;
  plaintext: string;
  /** `default`, `small`, or `large`. */
  textSize?: string;
  facets?: Array<LeafletFacet>;
}

export type LeafletBlockquoteBlock = LeafletTextBlock;

export interface LeafletHeaderBlock {
  $type?: string;
  level?: number;
  plaintext: string;
  facets?: Array<LeafletFacet>;
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

/**
 * Author-supplied markup. Leaflet's lexicon specifies it is rendered through a
 * sandboxed iframe's `srcdoc`, never injected into the host document.
 */
export interface LeafletHtmlBlock {
  $type?: string;
  html: string;
  /** Fixed pixel height (16–1600 per the lexicon). */
  height?: number;
  aspectRatio?: LeafletImageAspectRatio;
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

export interface LeafletStandardSitePublicationBlock {
  $type?: string;
  /** AT-URI of the referenced `site.standard.publication` record. */
  uri?: string;
  cid?: string;
  /**
   * Whether to style the embed with the publication's own theme. Defaults to
   * true when omitted (matching Leaflet's editor default).
   */
  showPublicationTheme?: boolean;
}

/** A single image entry inside a `pub.leaflet.blocks.imageGallery` block. */
export interface LeafletImageGalleryImage {
  $type?: string;
  image?: unknown;
  alt?: string;
  aspectRatio?: LeafletImageAspectRatio;
}

export interface LeafletImageGalleryBlock {
  $type?: string;
  images?: Array<LeafletImageGalleryImage>;
  /** Display format: "grid" (default) or "carousel". */
  format?: string;
}

export interface LeafletSignupBlock {
  $type?: string;
}

/** Rectangle of drawing space a `drawing` block shows. */
export interface LeafletDrawingViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One pen stroke. `points` is flattened `x, y, pressure` triples — x and y in
 * drawing space, pressure 0–1000.
 */
export interface LeafletDrawingStroke {
  points?: Array<number>;
  /** CSS hex, or a theme color name: `primary`, `accent`, `tertiary`. */
  color?: string;
  /** Base diameter in drawing space. */
  size?: number;
  simulatePressure?: boolean;
}

/** A filled polygon; `points` is flattened `x, y` pairs. */
export interface LeafletDrawingFill {
  points?: Array<number>;
  color?: string;
}

/** Freehand ink, scaled so `viewBox` fills the block's width. */
export interface LeafletDrawingBlock {
  $type?: string;
  viewBox?: LeafletDrawingViewBox;
  strokes?: Array<LeafletDrawingStroke>;
  /** Painted in order, beneath the strokes. */
  fills?: Array<LeafletDrawingFill>;
}

/**
 * Where members-only content begins. The gated blocks are not in the public
 * record, so this is always the last thing a non-member's copy carries.
 */
export interface LeafletMembersOnlyDelimiterBlock {
  $type?: string;
  /** `subscribers`, `paid`, or `tiers`. */
  audience?: string;
  tierIds?: Array<string>;
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

/** Tiled image under a canvas's pattern and blocks. */
export interface LeafletCanvasBackground {
  image?: unknown;
  /** Tile width in canvas px; defaults to 500. */
  width?: number;
  /** Percentage; defaults to 100. */
  opacity?: number;
}

/**
 * A canvas page as the renderer frames it, shared by every block placed on
 * it. Without a fixed size the canvas is Leaflet's 1272px wide and grows down
 * to fit its blocks.
 */
export interface LeafletCanvasFrame {
  pageId: string;
  width?: number;
  height?: number;
  /** `grid`, `dot`, or `plain`; absent, a growing canvas shows the grid. */
  pattern?: string;
  background?: LeafletCanvasBackground;
  /** `unconstrained`, `left`, or `center`. */
  mobileView?: string;
  /** Alt text an `embeddedCanvas` gave the canvas as a picture. */
  alt?: string;
  /** One of the document's own pages, rather than one shown inside another. */
  root: boolean;
}

/** Where a block sits on a canvas page. */
export interface LeafletCanvasPlacement {
  frame: LeafletCanvasFrame;
  /** The canvas entry; every block of a placed linear document shares it. */
  entry: number;
  x: number;
  y: number;
  width: number;
  height?: number;
  /** Degrees. */
  rotation?: number;
  /** Paint order among the canvas's entries, lowest first, from 1. */
  layer: number;
  /** Text alignment token (`…#textAlignCenter`) for a single block. */
  alignment?: string;
  /** Set when this canvas is itself shown on another canvas. */
  parent?: LeafletCanvasPlacement;
}

type LeafletBlockVariant =
  | { kind: "text"; block: LeafletTextBlock }
  | { kind: "header"; block: LeafletHeaderBlock }
  | { kind: "blockquote"; block: LeafletBlockquoteBlock }
  | { kind: "horizontalRule" }
  | { kind: "unorderedList"; block: LeafletUnorderedListBlock }
  | { kind: "orderedList"; block: LeafletOrderedListBlock }
  | { kind: "bskyPost"; block: LeafletBskyPostBlock }
  | { kind: "image"; block: LeafletImageBlock }
  | { kind: "code"; block: LeafletCodeBlock }
  | { kind: "html"; block: LeafletHtmlBlock }
  | { kind: "iframe"; block: LeafletIframeBlock }
  | { kind: "website"; block: LeafletWebsiteBlock }
  | { kind: "math"; block: LeafletMathBlock }
  | { kind: "button"; block: LeafletButtonBlock }
  | { kind: "poll"; block: LeafletPollBlock }
  | { kind: "separator" }
  | { kind: "standardSitePost"; block: LeafletStandardSitePostBlock }
  | {
      kind: "standardSitePublication";
      block: LeafletStandardSitePublicationBlock;
    }
  | { kind: "imageGallery"; block: LeafletImageGalleryBlock }
  | { kind: "signup" }
  | { kind: "drawing"; block: LeafletDrawingBlock }
  | { kind: "membersOnlyDelimiter"; block: LeafletMembersOnlyDelimiterBlock }
  | {
      kind: "pageEmbed";
      pageId: string;
      pageType?: string;
      blocks: Array<LeafletRenderableBlock>;
    }
  | { kind: "unknown"; blockType: string };

/**
 * A block in document order. Blocks from a canvas page carry where they sit on
 * it; everything that only needs reading order can ignore that.
 */
export type LeafletRenderableBlock = LeafletBlockVariant & {
  canvas?: LeafletCanvasPlacement;
};

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
