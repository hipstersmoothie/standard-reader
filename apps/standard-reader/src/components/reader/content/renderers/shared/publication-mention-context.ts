"use client";

import { createContext, useContext } from "react";

import type { InlineMentions } from "#/lib/leaflet/publication-mentions";
import { EMPTY_INLINE_MENTIONS } from "#/lib/leaflet/publication-mentions";

/**
 * Inline references (publications + actors) resolved for the article being
 * rendered — publications keyed by AT-URI and by `url:<normalized-homepage>`,
 * actors keyed by DID. Provided once at the article root and resolved lazily
 * (see {@link InlineMentionProvider}) so the deeply nested facet renderer can
 * upgrade links/mentions to avatar chips without threading props through every
 * block, and without blocking the article's initial paint.
 */
const InlineMentionContext = createContext<InlineMentions>(
  EMPTY_INLINE_MENTIONS,
);

export const InlineMentionContextProvider = InlineMentionContext.Provider;

export function useInlineMentions(): InlineMentions {
  return useContext(InlineMentionContext);
}
