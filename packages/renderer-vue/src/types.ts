import type {
  AspectRatio,
  CollectionImage,
} from "@standard-reader/renderer-core";
import type { VNode, VNodeArrayChildren } from "vue";

/** Anything Vue can render in a child position (excludes `undefined`/`void`,
 *  which `h()` does not accept as children). */
export type Renderable =
  | VNode
  | string
  | number
  | boolean
  | null
  | VNodeArrayChildren;

/** A rendered table cell. */
export interface VueTableCell {
  header: boolean;
  content: Renderable;
}

export type VueTableRow = Array<VueTableCell>;

// ---------------------------------------------------------------------------
// Inline (facet) components — shared
// ---------------------------------------------------------------------------

export interface VueInlineComponents {
  /** Top-level renderer for a run of faceted plaintext. Override to take full
   *  control; otherwise it composes the marks below. */
  facetText: (
    props: { plaintext: string; facets?: Array<unknown> },
    ctx: RenderContext,
  ) => Renderable;
  strong: (children: Renderable) => Renderable;
  emphasis: (children: Renderable) => Renderable;
  inlineCode: (children: Renderable) => Renderable;
  underline: (children: Renderable) => Renderable;
  strikethrough: (children: Renderable) => Renderable;
  highlight: (children: Renderable) => Renderable;
  link: (props: { href: string }, children: Renderable) => Renderable;
  mention: (
    props: { atUri?: string; did?: string },
    children: Renderable,
  ) => Renderable;
  footnoteReference: (props: {
    footnoteId: string;
    number: number | null;
    contentPlaintext?: string;
  }) => Renderable;
}

// ---------------------------------------------------------------------------
// Block components — shared
// ---------------------------------------------------------------------------

export interface VueSharedComponents extends VueInlineComponents {
  root: (children: Renderable) => Renderable;
  paragraph: (props: { dropCap: boolean }, children: Renderable) => Renderable;
  heading: (props: { level: number }, children: Renderable) => Renderable;
  blockquote: (children: Renderable) => Renderable;
  callout: (
    props: { emoji?: string; color?: string },
    children: Renderable,
  ) => Renderable;
  horizontalRule: () => Renderable;
  bulletList: (children: Renderable) => Renderable;
  orderedList: (props: { start?: number }, children: Renderable) => Renderable;
  listItem: (children: Renderable) => Renderable;
  taskList: (children: Renderable) => Renderable;
  taskListItem: (
    props: { checked: boolean },
    children: Renderable,
  ) => Renderable;
  code: (props: { code: string; language?: string }) => Renderable;
  image: (props: {
    src: string;
    alt: string;
    aspectRatio?: AspectRatio;
    fullBleed?: boolean;
    caption?: string;
  }) => Renderable;
  iframe: (props: {
    url: string;
    height?: number;
    aspectRatio?: { width?: number; height?: number };
  }) => Renderable;
  website: (props: {
    src: string;
    title?: string;
    description?: string;
    previewImage?: string;
  }) => Renderable;
  table: (props: { rows: Array<VueTableRow> }) => Renderable;
  math: (props: { tex: string }) => Renderable;
  button: (props: {
    text: string;
    href: string;
    caption?: string;
    alignment?: string;
  }) => Renderable;
  blueskyEmbed: (props: { postUri: string }) => Renderable;
  imageGrid: (props: {
    images: Array<CollectionImage>;
    caption?: string;
    layout?: string;
  }) => Renderable;
  imageCarousel: (props: {
    images: Array<CollectionImage>;
    caption?: string;
    layout?: string;
  }) => Renderable;
  imageDiff: (props: {
    before: CollectionImage;
    after: CollectionImage;
    caption?: string;
    labels?: [string?, string?];
  }) => Renderable;
  footnotes: (children: Renderable) => Renderable;
  footnoteItem: (
    props: { id: string; number: number },
    children: Renderable,
  ) => Renderable;
  unknown: (props: { blockType: string }) => Renderable;
}

// ---------------------------------------------------------------------------
// Platform components
// ---------------------------------------------------------------------------

export interface VueLeafletComponents {
  poll: (props: { pollUri: string }) => Renderable;
  signup: () => Renderable;
  separator: () => Renderable;
  standardSitePost: (props: { uri: string }) => Renderable;
  standardSitePublication: (props: {
    uri: string;
    cid?: string;
    showPublicationTheme?: boolean;
  }) => Renderable;
  pageEmbed: (
    props: { pageId: string; pageType?: string },
    children: Renderable,
  ) => Renderable;
}

export interface VuePcktComponents {
  gallery: (props: { ref: string }) => Renderable;
  noteEmbed: (props: { uri?: string; cid?: string }) => Renderable;
}

export interface VueOffprintComponents {
  component: (props: { componentUri: string }) => Renderable;
}

/** The fully-resolved component registry used internally after merging. */
export interface VueComponents {
  shared: VueSharedComponents;
  leaflet: VueLeafletComponents;
  pckt: VuePcktComponents;
  offprint: VueOffprintComponents;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K];
};

/** The `components` input shape: override any subset. */
export type VueComponentsInput = DeepPartial<VueComponents>;

/** Threaded through the walk so components can render inline/child content. */
export interface RenderContext {
  components: VueComponents;
  footnoteNumbers: ReadonlyMap<string, number>;
}
