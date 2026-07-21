import type { TemplateRef } from "@angular/core";
import type {
  AspectRatio,
  CollectionImage,
  RichText,
} from "@standard-reader/renderer-core";

/** An override template. The node's props arrive as the `$implicit` context —
 *  bind them with `let-p` (or `let-p="$implicit"`) on your `<ng-template>`. */
export type Tpl<T> = TemplateRef<{ $implicit: T }>;

/**
 * Component overrides are Angular {@link TemplateRef}s keyed by node type. They
 * cover the media and data-backed blocks that most need customizing; structural
 * blocks (paragraphs, headings, lists, …) render as unstyled semantic HTML you
 * style with CSS.
 *
 * ```html
 * <ng-template #poll let-p><live-poll [uri]="p.pollUri" /></ng-template>
 * <sr-standard-document [document]="doc" [components]="{ leaflet: { poll } }" />
 * ```
 */
export interface AngularSharedComponents {
  image?: Tpl<{
    src: string;
    alt: string;
    aspectRatio?: AspectRatio;
    fullBleed?: boolean;
    caption?: string;
  }>;
  code?: Tpl<{ code: string; language?: string }>;
  iframe?: Tpl<{
    url: string;
    height?: number;
    aspectRatio?: { width?: number; height?: number };
  }>;
  website?: Tpl<{
    src: string;
    title?: string;
    description?: string;
    previewImage?: string;
  }>;
  table?: Tpl<{ rows: Array<Array<{ header: boolean; text: RichText }>> }>;
  math?: Tpl<{ tex: string }>;
  button?: Tpl<{
    text: string;
    href: string;
    caption?: string;
    alignment?: string;
  }>;
  blueskyEmbed?: Tpl<{ postUri: string }>;
  imageGrid?: Tpl<{
    images: Array<CollectionImage>;
    caption?: string;
    layout?: string;
  }>;
  imageCarousel?: Tpl<{
    images: Array<CollectionImage>;
    caption?: string;
    layout?: string;
  }>;
  imageDiff?: Tpl<{
    before: CollectionImage;
    after: CollectionImage;
    caption?: string;
    labels?: [string?, string?];
  }>;
  unknown?: Tpl<{ blockType: string }>;
}

export interface AngularLeafletComponents {
  poll?: Tpl<{ pollUri: string }>;
  signup?: Tpl<Record<string, never>>;
  separator?: Tpl<Record<string, never>>;
  standardSitePost?: Tpl<{ uri: string }>;
  standardSitePublication?: Tpl<{
    uri: string;
    cid?: string;
    showPublicationTheme?: boolean;
  }>;
}

export interface AngularPcktComponents {
  gallery?: Tpl<{ ref: string }>;
  noteEmbed?: Tpl<{ uri?: string; cid?: string }>;
}

export interface AngularOffprintComponents {
  component?: Tpl<{ componentUri: string }>;
}

/** The `components` input: override any subset with `<ng-template>` refs. */
export interface AngularComponents {
  shared?: AngularSharedComponents;
  leaflet?: AngularLeafletComponents;
  pckt?: AngularPcktComponents;
  offprint?: AngularOffprintComponents;
}
