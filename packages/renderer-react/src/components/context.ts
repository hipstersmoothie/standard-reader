import { createContext, useContext } from "react";

import type { ImageUrlResolver } from "../types";
import type { RendererComponents } from "./types";

const ComponentsContext = createContext<RendererComponents | null>(null);

/** Per-document rendering context threaded to every block. */
export interface DocumentContextValue {
  authorDid?: string;
  resolveImageUrl: ImageUrlResolver;
  dropCap: boolean;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

/** `footnoteId` → 1-based display number, for inline footnote references. */
const FootnoteNumbersContext = createContext<ReadonlyMap<string, number>>(
  new Map(),
);

export const ComponentsProvider = ComponentsContext.Provider;
export const DocumentProvider = DocumentContext.Provider;
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

export function useDocumentContext(): DocumentContextValue {
  const value = useContext(DocumentContext);
  if (!value) {
    throw new Error(
      "Standard Reader document context is unavailable. Render inside <StandardDocumentRenderer>.",
    );
  }
  return value;
}

export function useFootnoteNumber(footnoteId: string): number | null {
  const numbers = useContext(FootnoteNumbersContext);
  return numbers.get(footnoteId) ?? null;
}
