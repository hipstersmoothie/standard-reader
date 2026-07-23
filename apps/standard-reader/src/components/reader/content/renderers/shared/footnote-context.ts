"use client";

import { createContext, useContext } from "react";

/**
 * Maps a footnote's `footnoteId` to its display number for the article being
 * rendered. Provided once at the article root (see the leaflet renderer) so the
 * deeply nested facet renderer can number inline references without threading
 * props through every block. Empty by default, so faceted text rendered outside
 * an article (comments, previews) simply omits footnote markers.
 */
const FootnoteNumberContext = createContext<ReadonlyMap<string, number>>(
  new Map(),
);

export const FootnoteNumberProvider = FootnoteNumberContext.Provider;

export function useFootnoteNumber(id: string | undefined): number | null {
  const numberById = useContext(FootnoteNumberContext);
  if (!id) return null;
  return numberById.get(id) ?? null;
}
