import type { LeafletFacet } from "#/lib/leaflet/types";

export const MARKPUB_MARKDOWN = "at.markpub.markdown";
export const MARKPUB_TEXT = "at.markpub.text";

export type MarkpubFlavor = "gfm" | "commonmark";

export interface MarkpubLens {
  facets: Array<{ $type?: string }>;
}

export interface MarkpubDocument {
  flavor: MarkpubFlavor;
  extensions: Array<string>;
  frontMatter: Array<unknown>;
  facets: Array<LeafletFacet>;
  lenses: Array<MarkpubLens>;
  markdown: string;
}
