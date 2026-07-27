import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import type {
  CollectionColophon,
  CollectionEditorial,
} from "#/lib/collections/manifest";
import type { CollectionTheme } from "#/lib/collections/theme";

/** Shell chrome while a collection or list issue is loading. */
export type MagazineShellData = {
  isCollection: boolean;
  theme: CollectionTheme | null;
};

/** Opener metadata derived from an article, for the magazine art direction. */
export interface MagMeta {
  id: string;
  did: string;
  rkey: string;
  title: string;
  dek: string | null;
  author: string;
  handle: string | null;
  date: string;
  minutes: number;
  pubName: string;
  topic: string;
  coverImageUrl: string | null;
  /** True when `coverImageUrl` was promoted from the article's first image block. */
  leadImageFromFirstBlock?: boolean;
  /** Canonical/publication URL of the original post, for the header link. */
  externalUrl: string | null;
}

/** A composed feature: opener metadata + the full article record to render. */
export interface MagFeature {
  meta: MagMeta;
  detail: ArticleDetail;
  /** Curator's note for this piece in a collection (markdown), shown at the opener. */
  note?: string | null;
}

/** Subscribe / follow target shown on the magazine end spread. */
export type MagSubscribeTarget =
  | {
      kind: "publication";
      uri: string;
      name: string;
      did: string;
      rkey: string;
    }
  | {
      kind: "list";
      uri: string;
      name: string;
      did: string;
      rkey: string;
    };

export interface MagIssue {
  name: string;
  no: string;
  ownerHandle: string | null;
  features: Array<MagFeature>;
  /** Collection-only: the owning publication's name, shown above the title. */
  publicationName?: string | null;
  /** Collection-only: optional editorial intro spread (markdown body). */
  editorial?: CollectionEditorial | null;
  /** Collection-only: optional closing credits on the end spread (markdown). */
  colophon?: CollectionColophon | null;
  /** Collection-only: the issue cover image. */
  coverImageUrl?: string | null;
  /** Collection-only: publication theme colors + Google fonts. */
  theme?: CollectionTheme | null;
  /** Publication or list to promote on the end spread. */
  subscribe?: MagSubscribeTarget | null;
  /** Collection document URI — enables the end-spread like button. */
  documentUri?: string | null;
  /** Cached recommend count for {@link documentUri}. */
  recommendCount?: number;
}
