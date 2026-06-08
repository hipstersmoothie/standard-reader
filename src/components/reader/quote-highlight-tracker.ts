import type { QuoteHighlightRange } from "#/lib/quote-highlight-text";

import { createContext, useContext } from "react";

export function intersectHighlightRange(
  global: QuoteHighlightRange | null,
  blockStart: number,
  blockLength: number,
): QuoteHighlightRange | null {
  if (!global || blockLength <= 0) return null;

  const blockEnd = blockStart + blockLength;
  if (global.end <= blockStart || global.start >= blockEnd) return null;

  return {
    start: Math.max(0, global.start - blockStart),
    end: Math.min(blockLength, global.end - blockStart),
  };
}

/** Tracks global quote offsets block-by-block during render. */
export class QuoteHighlightTracker {
  private offset = 0;

  constructor(private readonly global: QuoteHighlightRange | null) {}

  consume(length: number): QuoteHighlightRange | null {
    const local = intersectHighlightRange(this.global, this.offset, length);
    this.offset += length;
    return local;
  }
}

export const QuoteHighlightTrackerContext =
  createContext<QuoteHighlightTracker | null>(null);

export function useQuoteHighlightTracker(): QuoteHighlightTracker | null {
  return useContext(QuoteHighlightTrackerContext);
}
