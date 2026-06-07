/** pckt.blog rich-text facet feature types (`blog.pckt.richtext.facet#*`). */
export const PCKT_FACET = {
  bold: "blog.pckt.richtext.facet#bold",
  italic: "blog.pckt.richtext.facet#italic",
  link: "blog.pckt.richtext.facet#link",
  code: "blog.pckt.richtext.facet#code",
  underline: "blog.pckt.richtext.facet#underline",
  strikethrough: "blog.pckt.richtext.facet#strikethrough",
  highlight: "blog.pckt.richtext.facet#highlight",
  didMention: "blog.pckt.richtext.facet#didMention",
  atMention: "blog.pckt.richtext.facet#atMention",
} as const;

export const PCKT_BLOCK = {
  text: "blog.pckt.block.text",
  heading: "blog.pckt.block.heading",
  blockquote: "blog.pckt.block.blockquote",
  horizontalRule: "blog.pckt.block.horizontalRule",
  bulletList: "blog.pckt.block.bulletList",
  orderedList: "blog.pckt.block.orderedList",
  listItem: "blog.pckt.block.listItem",
  taskList: "blog.pckt.block.taskList",
  taskItem: "blog.pckt.block.taskItem",
  image: "blog.pckt.block.image",
  codeBlock: "blog.pckt.block.codeBlock",
  iframe: "blog.pckt.block.iframe",
  blueskyEmbed: "blog.pckt.block.blueskyEmbed",
  gallery: "blog.pckt.block.gallery",
  table: "blog.pckt.block.table",
  tableRow: "blog.pckt.block.tableRow",
  tableHeader: "blog.pckt.block.tableHeader",
  tableCell: "blog.pckt.block.tableCell",
  website: "blog.pckt.block.website",
} as const;

export const PCKT_CONTENT = "blog.pckt.content";

export interface PcktByteRange {
  byteStart: number;
  byteEnd: number;
}

export interface PcktFacetFeature {
  $type?: string;
  uri?: string;
  did?: string;
  atURI?: string;
}

export interface PcktFacet {
  index: PcktByteRange;
  features: Array<PcktFacetFeature>;
}

export interface PcktTextBlock {
  $type?: string;
  plaintext: string;
  facets?: Array<PcktFacet>;
}

export interface PcktHeadingBlock {
  $type?: string;
  level?: number;
  plaintext: string;
  facets?: Array<PcktFacet>;
}

export interface PcktImageAttrs {
  alt?: string;
  src?: string;
  blob?: unknown;
  align?: "left" | "center" | "right";
  title?: string;
  aspectRatio?: { width?: number; height?: number };
}

export interface PcktImageBlock {
  $type?: string;
  attrs?: PcktImageAttrs;
}

export interface PcktCodeBlock {
  $type?: string;
  plaintext: string;
  language?: string;
  attrs?: { language?: string };
}

export interface PcktIframeBlock {
  $type?: string;
  url?: string;
  height?: number;
}

export interface PcktBlueskyEmbedBlock {
  $type?: string;
  postRef?: { uri?: string; cid?: string };
}

export interface PcktListBlock {
  $type?: string;
  start?: number;
  content?: Array<PcktListItemBlock | Record<string, unknown>>;
}

export interface PcktListItemBlock {
  $type?: string;
  content?: Array<Record<string, unknown>>;
}

export interface PcktTaskItemBlock {
  $type?: string;
  attrs?: { checked?: boolean };
  content?: Array<Record<string, unknown>>;
}

export interface PcktTaskListBlock {
  $type?: string;
  content?: Array<PcktTaskItemBlock | Record<string, unknown>>;
}

export interface PcktBlockquoteBlock {
  $type?: string;
  content?: Array<PcktTextBlock | Record<string, unknown>>;
}

export interface PcktTableBlock {
  $type?: string;
  content?: Array<PcktTableRowBlock | Record<string, unknown>>;
}

export interface PcktTableRowBlock {
  $type?: string;
  content?: Array<PcktTableCellBlock | Record<string, unknown>>;
}

export interface PcktTableCellBlock {
  $type?: string;
  attrs?: { colspan?: number; rowspan?: number };
  content?: Array<PcktTextBlock | Record<string, unknown>>;
}

export interface PcktWebsiteBlock {
  $type?: string;
  src?: string;
  title?: string;
  description?: string;
  previewImage?: string;
}

export interface PcktGalleryBlock {
  $type?: string;
  ref?: string;
}

export type PcktRenderableBlock =
  | { kind: "text"; block: PcktTextBlock }
  | { kind: "heading"; block: PcktHeadingBlock }
  | { kind: "blockquote"; block: PcktBlockquoteBlock }
  | { kind: "horizontalRule" }
  | { kind: "bulletList"; block: PcktListBlock }
  | { kind: "orderedList"; block: PcktListBlock }
  | { kind: "taskList"; block: PcktTaskListBlock }
  | { kind: "image"; block: PcktImageBlock }
  | { kind: "code"; block: PcktCodeBlock }
  | { kind: "iframe"; block: PcktIframeBlock }
  | { kind: "blueskyEmbed"; block: PcktBlueskyEmbedBlock }
  | { kind: "table"; block: PcktTableBlock }
  | { kind: "website"; block: PcktWebsiteBlock }
  | { kind: "gallery"; block: PcktGalleryBlock }
  | { kind: "unknown"; blockType: string };

export interface PcktContent {
  $type?: string;
  items?: Array<Record<string, unknown>>;
  /** Out-of-record JSON blob holding `items` when inline `items` is empty. */
  blob?: unknown;
  references?: Array<unknown>;
}
