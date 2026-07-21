import type {
  AspectRatio,
  CollectionImage,
} from "@standard-reader/renderer-core";
import type { TemplateResult, nothing } from "lit";

/** Anything `lit-html` can render in a child position. */
export type Renderable =
  | TemplateResult
  | string
  | number
  | null
  | typeof nothing
  | ReadonlyArray<Renderable>;

/** A rendered table cell. */
export interface LitTableCell {
  header: boolean;
  content: Renderable;
}

export type LitTableRow = Array<LitTableCell>;

// ---------------------------------------------------------------------------
// Inline (facet) components — shared
// ---------------------------------------------------------------------------

export interface LitInlineComponents {
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

export interface LitSharedComponents extends LitInlineComponents {
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
  table: (props: { rows: Array<LitTableRow> }) => Renderable;
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

export interface LitLeafletComponents {
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

export interface LitPcktComponents {
  gallery: (props: { ref: string }) => Renderable;
  noteEmbed: (props: { uri?: string; cid?: string }) => Renderable;
}

export interface LitOffprintComponents {
  component: (props: { componentUri: string }) => Renderable;
}

/** The fully-resolved component registry used internally after merging. */
export interface LitComponents {
  shared: LitSharedComponents;
  leaflet: LitLeafletComponents;
  pckt: LitPcktComponents;
  offprint: LitOffprintComponents;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K];
};

/** The `components` input shape: override any subset. */
export type LitComponentsInput = DeepPartial<LitComponents>;

/** Threaded through the walk so components can render inline/child content. */
export interface RenderContext {
  components: LitComponents;
  footnoteNumbers: ReadonlyMap<string, number>;
}
