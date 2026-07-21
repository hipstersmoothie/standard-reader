import { createContext, useContext } from "react";

import type { RendererComponents } from "./types";

const ComponentsContext = createContext<RendererComponents | null>(null);

/** `footnoteId` → 1-based display number, for inline footnote references. */
const FootnoteNumbersContext = createContext<ReadonlyMap<string, number>>(
  new Map(),
);

export const ComponentsProvider = ComponentsContext.Provider;
export const FootnoteNumbersProvider = FootnoteNumbersContext.Provider;

export function useComponents(): RendererComponents {
  const value = useContext(ComponentsContext);
  if (!value) {
    throw new Error(
      "Standard Reader renderer components are unavailable. Render inside <StandardDocumentRenderer>.",
    );
  }
  return value;
}

/** The footnote numbering map for the current document. */
export function useFootnoteNumbers(): ReadonlyMap<string, number> {
  return useContext(FootnoteNumbersContext);
}
