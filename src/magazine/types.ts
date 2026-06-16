import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import type { CollectionEditorial } from "#/lib/collections/manifest";
import type { CollectionTheme } from "#/lib/collections/theme";

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
}

/** A composed feature: opener metadata + the full article record to render. */
export interface MagFeature {
  meta: MagMeta;
  detail: ArticleDetail;
  /** Curator's note for this piece in a collection (markdown), shown at the opener. */
  note?: string | null;
}

export interface MagIssue {
  name: string;
  no: string;
  sub: string;
  ownerHandle: string | null;
  features: Array<MagFeature>;
  /** Collection-only: the owning publication's name, shown above the title. */
  publicationName?: string | null;
  /** Collection-only: optional editorial intro spread (markdown body). */
  editorial?: CollectionEditorial | null;
  /** Collection-only: the issue cover image. */
  coverImageUrl?: string | null;
  /** Collection-only: publication theme colors + Google fonts. */
  theme?: CollectionTheme | null;
}
