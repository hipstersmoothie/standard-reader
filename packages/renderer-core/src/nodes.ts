/**
 * The framework-agnostic render tree.
 *
 * `buildRenderTree` normalizes every supported content format (Leaflet, pckt,
 * Offprint, third-party structured) into this single vocabulary of
 * {@link BlockNode}s. A UI-framework renderer (React, Lit, Vue, …) only needs
 * to walk this tree and map each node type to its own component/template —
 * none of the format-specific parsing lives in the framework layer.
 *
 * Inline rich text is carried as {@link RichText} (`plaintext` + byte-indexed
 * facets); call {@link segmentInline} to turn it into an {@link InlineNode}
 * tree of marks, links, mentions and footnote references.
 */

import type { AspectRatio } from "./types";

/** A run of rich text: plaintext plus byte-indexed AT-Proto facets. */
export interface RichText {
  plaintext: string;
  facets?: Array<unknown>;
}

/** Inline formatting marks recognized across every format's facet dialect. */
export type MarkKind =
  | "strong"
  | "emphasis"
  | "code"
  | "underline"
  | "strikethrough"
  | "highlight";

/** The inline tree produced by {@link segmentInline}. */
export type InlineNode =
  | { type: "text"; value: string }
  | { type: "mark"; mark: MarkKind; children: Array<InlineNode> }
  | { type: "link"; href: string; children: Array<InlineNode> }
  | {
      type: "mention";
      atUri?: string;
      did?: string;
      children: Array<InlineNode>;
    }
  | {
      type: "footnoteRef";
      footnoteId: string;
      /** 1-based number, or null when the note has no registered entry. */
      number: number | null;
      contentPlaintext?: string;
    };

export interface CollectionImage {
  src: string;
  alt: string;
  aspectRatio?: AspectRatio;
}

export interface TableCell {
  header: boolean;
  text: RichText;
}

export type TableRow = Array<TableCell>;

/** A list item: one or more inline runs plus any nested lists. */
export interface ListItem {
  runs: Array<RichText>;
  children: Array<BlockNode>;
}

export interface TaskItem {
  checked: boolean;
  runs: Array<RichText>;
}

export type BlockNode =
  | { type: "paragraph"; text: RichText; dropCap: boolean }
  | { type: "heading"; level: number; text: RichText }
  | { type: "blockquote"; paragraphs: Array<RichText> }
  | { type: "callout"; text: RichText; emoji?: string; color?: string }
  | { type: "horizontalRule" }
  | { type: "bulletList"; items: Array<ListItem> }
  | { type: "orderedList"; start?: number; items: Array<ListItem> }
  | { type: "taskList"; items: Array<TaskItem> }
  | { type: "code"; code: string; language?: string }
  | {
      type: "image";
      src: string;
      alt: string;
      aspectRatio?: AspectRatio;
      fullBleed?: boolean;
      caption?: string;
    }
  | {
      type: "iframe";
      url: string;
      height?: number;
      aspectRatio?: { width?: number; height?: number };
    }
  | {
      type: "website";
      src: string;
      title?: string;
      description?: string;
      previewImage?: string;
    }
  | { type: "table"; rows: Array<TableRow> }
  | { type: "math"; tex: string }
  | {
      type: "button";
      text: string;
      href: string;
      caption?: string;
      alignment?: string;
    }
  | { type: "blueskyEmbed"; postUri: string }
  | {
      type: "imageGrid";
      images: Array<CollectionImage>;
      caption?: string;
      layout?: string;
    }
  | {
      type: "imageCarousel";
      images: Array<CollectionImage>;
      caption?: string;
      layout?: string;
    }
  | {
      type: "imageDiff";
      before: CollectionImage;
      after: CollectionImage;
      caption?: string;
      labels?: [string?, string?];
    }
  | { type: "unknown"; blockType: string }
  // Platform-specific blocks — usually interactive or data-backed embeds.
  | { type: "leaflet.poll"; pollUri: string }
  | { type: "leaflet.signup" }
  | { type: "leaflet.separator" }
  | { type: "leaflet.standardSitePost"; uri: string }
  | {
      type: "leaflet.standardSitePublication";
      uri: string;
      cid?: string;
      showPublicationTheme?: boolean;
    }
  | {
      type: "leaflet.pageEmbed";
      pageId: string;
      pageType?: string;
      children: Array<BlockNode>;
    }
  | { type: "pckt.gallery"; ref: string }
  | { type: "pckt.noteEmbed"; uri?: string; cid?: string }
  | { type: "offprint.component"; componentUri: string };

/** A footnote entry to render at the end of the body (Leaflet only). */
export interface FootnoteEntry {
  id: string;
  number: number;
  text: RichText;
}

/** The full normalized document, ready for any framework renderer to walk. */
export interface DocumentTree {
  /** The resolved content format `$type`. */
  format: string;
  /** Body blocks in document order. */
  children: Array<BlockNode>;
  /** Endnotes to render after the body. */
  footnotes: Array<FootnoteEntry>;
  /** `footnoteId` → 1-based number, for inline references. */
  footnoteNumbers: ReadonlyMap<string, number>;
}
