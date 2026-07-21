import type {
  AspectRatio,
  CollectionImage,
} from "@standard-reader/renderer-core";
import type { Snippet } from "svelte";

/**
 * Component overrides are Svelte {@link Snippet}s keyed by node type. Container
 * nodes receive a `children` snippet you render with `{@render children()}`;
 * leaf nodes just receive their props. Anything you don't override renders as
 * the unstyled semantic-HTML default.
 *
 * ```svelte
 * {#snippet paragraph({ dropCap, children })}
 *   <p class:drop={dropCap}>{@render children()}</p>
 * {/snippet}
 * <StandardDocument {document} components={{ shared: { paragraph } }} />
 * ```
 */

interface WithChildren {
  children: Snippet;
}

export interface SvelteInlineComponents {
  strong?: Snippet<[WithChildren]>;
  emphasis?: Snippet<[WithChildren]>;
  inlineCode?: Snippet<[WithChildren]>;
  underline?: Snippet<[WithChildren]>;
  strikethrough?: Snippet<[WithChildren]>;
  highlight?: Snippet<[WithChildren]>;
  link?: Snippet<[{ href: string } & WithChildren]>;
  mention?: Snippet<[{ atUri?: string; did?: string } & WithChildren]>;
  footnoteReference?: Snippet<
    [{ footnoteId: string; number: number | null; contentPlaintext?: string }]
  >;
}

export interface SvelteSharedComponents extends SvelteInlineComponents {
  root?: Snippet<[WithChildren]>;
  paragraph?: Snippet<[{ dropCap: boolean } & WithChildren]>;
  heading?: Snippet<[{ level: number } & WithChildren]>;
  blockquote?: Snippet<[WithChildren]>;
  callout?: Snippet<[{ emoji?: string; color?: string } & WithChildren]>;
  horizontalRule?: Snippet;
  bulletList?: Snippet<[WithChildren]>;
  orderedList?: Snippet<[{ start?: number } & WithChildren]>;
  listItem?: Snippet<[WithChildren]>;
  taskList?: Snippet<[WithChildren]>;
  taskListItem?: Snippet<[{ checked: boolean } & WithChildren]>;
  code?: Snippet<[{ code: string; language?: string }]>;
  image?: Snippet<
    [
      {
        src: string;
        alt: string;
        aspectRatio?: AspectRatio;
        fullBleed?: boolean;
        caption?: string;
      },
    ]
  >;
  iframe?: Snippet<
    [
      {
        url: string;
        height?: number;
        aspectRatio?: { width?: number; height?: number };
      },
    ]
  >;
  website?: Snippet<
    [
      {
        src: string;
        title?: string;
        description?: string;
        previewImage?: string;
      },
    ]
  >;
  table?: Snippet<
    [{ rows: Array<Array<{ header: boolean; text: RichCell }>> }]
  >;
  math?: Snippet<[{ tex: string }]>;
  button?: Snippet<
    [{ text: string; href: string; caption?: string; alignment?: string }]
  >;
  blueskyEmbed?: Snippet<[{ postUri: string }]>;
  imageGrid?: Snippet<
    [{ images: Array<CollectionImage>; caption?: string; layout?: string }]
  >;
  imageCarousel?: Snippet<
    [{ images: Array<CollectionImage>; caption?: string; layout?: string }]
  >;
  imageDiff?: Snippet<
    [
      {
        before: CollectionImage;
        after: CollectionImage;
        caption?: string;
        labels?: [string?, string?];
      },
    ]
  >;
  footnotes?: Snippet<[WithChildren]>;
  footnoteItem?: Snippet<[{ id: string; number: number } & WithChildren]>;
  unknown?: Snippet<[{ blockType: string }]>;
}

/** A table cell whose `text` is rendered inline by the renderer. */
export interface RichCell {
  plaintext: string;
  facets?: Array<unknown>;
}

export interface SvelteLeafletComponents {
  poll?: Snippet<[{ pollUri: string }]>;
  signup?: Snippet;
  separator?: Snippet;
  standardSitePost?: Snippet<[{ uri: string }]>;
  standardSitePublication?: Snippet<
    [{ uri: string; cid?: string; showPublicationTheme?: boolean }]
  >;
  pageEmbed?: Snippet<[{ pageId: string; pageType?: string } & WithChildren]>;
}

export interface SveltePcktComponents {
  gallery?: Snippet<[{ ref: string }]>;
  noteEmbed?: Snippet<[{ uri?: string; cid?: string }]>;
}

export interface SvelteOffprintComponents {
  component?: Snippet<[{ componentUri: string }]>;
}

/** The `components` prop: override any subset with Svelte snippets. */
export interface SvelteComponents {
  shared?: SvelteSharedComponents;
  leaflet?: SvelteLeafletComponents;
  pckt?: SveltePcktComponents;
  offprint?: SvelteOffprintComponents;
}
