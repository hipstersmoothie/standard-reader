/** Normalized rich-text paragraph shared by block-based content formats. */
export interface StructuredText {
  plaintext: string;
  facets?: Array<unknown>;
}

/** Image entry used by Offprint grid, carousel, and diff blocks. */
export interface StructuredGridImage {
  blob?: unknown;
  alt?: string;
  aspectRatio?: { width?: number; height?: number };
}

/**
 * One entry in a bullet or ordered list.
 *
 * `children` carries lists nested beneath this item. Most block formats have a
 * flat list vocabulary and never set it; markdown genuinely nests, and dropping
 * that nesting silently loses whole branches of a document.
 */
export interface StructuredListItem {
  text: StructuredText;
  children?: Array<StructuredRenderableBlock>;
}

export type StructuredRenderableBlock =
  | { kind: "text"; text: StructuredText }
  | { kind: "heading"; text: StructuredText; level?: number }
  | { kind: "blockquote"; blocks: Array<StructuredRenderableBlock> }
  | {
      kind: "callout";
      text: StructuredText;
      emoji?: string;
      color?: string;
    }
  | { kind: "horizontalRule" }
  | { kind: "bulletList"; items: Array<StructuredListItem> }
  | { kind: "orderedList"; start?: number; items: Array<StructuredListItem> }
  | {
      kind: "taskList";
      items: Array<{ checked?: boolean; text: StructuredText }>;
    }
  | { kind: "blueskyEmbed"; postUri: string; postCid?: string }
  | {
      kind: "image";
      blob?: unknown;
      externalSrc?: string;
      alt?: string;
      caption?: string;
      aspectRatio?: { width?: number; height?: number };
    }
  | { kind: "code"; plaintext: string; language?: string }
  | { kind: "iframe"; url: string; height?: number }
  | {
      kind: "website";
      src: string;
      title?: string;
      description?: string;
      previewImage?: string;
    }
  | { kind: "table"; rows: StructuredTableRow }
  | { kind: "gallery"; ref: string }
  | {
      kind: "button";
      text: string;
      href: string;
      caption?: string;
      alignment?: string;
    }
  | { kind: "math"; tex: string }
  | {
      kind: "imageGrid";
      images: Array<StructuredGridImage>;
      caption?: string;
      gridRows?: number;
      aspectRatioMode?: string;
    }
  | {
      kind: "imageCarousel";
      images: Array<StructuredGridImage>;
      caption?: string;
    }
  | {
      kind: "imageDiff";
      images: [StructuredGridImage, StructuredGridImage];
      caption?: string;
      labels?: [string?, string?];
      alignment?: string;
    }
  /**
   * An `app.offprint.component` record inlined by AT-URI. Offprint references
   * it by URI rather than strongRef so publication-wide edits (a newsletter
   * footer, a content warning) cascade to every document embedding it — so it
   * is resolved when read, not pinned at ingest.
   */
  | { kind: "offprintComponent"; componentUri: string }
  | { kind: "unknown"; blockType: string };

export interface StructuredTableCell {
  isHeader?: boolean;
  text: StructuredText;
}

export type StructuredTableRow = Array<Array<StructuredTableCell>>;

/** Item-array content formats (`items[]` of typed blocks). */
export interface StructuredItemsContent {
  $type?: string;
  items?: Array<Record<string, unknown>>;
}

export const STANDARD_MARKDOWN_CONTENT = "site.standard.content.markdown";

export interface StandardMarkdownContent {
  $type?: typeof STANDARD_MARKDOWN_CONTENT;
  text?: string;
}
