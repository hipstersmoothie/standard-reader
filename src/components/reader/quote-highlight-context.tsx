import type { QuoteHighlightRange } from "#/lib/quote-highlight-text";

import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "./content/body-styles";
import {
  QuoteHighlightTracker,
  QuoteHighlightTrackerContext,
} from "./quote-highlight-tracker";

export function QuoteShareMark({ children }: { children: React.ReactNode }) {
  return (
    <mark
      data-quote-share="true"
      {...stylex.props(articleBodyStyles.quoteShareMark)}
    >
      {children}
    </mark>
  );
}

export function QuoteHighlightProvider({
  range,
  children,
}: {
  range: QuoteHighlightRange | null;
  children: React.ReactNode;
}) {
  const tracker = range ? new QuoteHighlightTracker(range) : null;

  return (
    <QuoteHighlightTrackerContext.Provider value={tracker}>
      {children}
    </QuoteHighlightTrackerContext.Provider>
  );
}

export function HighlightedPlaintext({
  plaintext,
  highlightRange,
}: {
  plaintext: string;
  highlightRange: QuoteHighlightRange | null;
}) {
  if (!highlightRange || highlightRange.start >= highlightRange.end) {
    return plaintext;
  }

  const { start, end } = highlightRange;
  const before = plaintext.slice(0, start);
  const marked = plaintext.slice(start, end);
  const after = plaintext.slice(end);

  return (
    <>
      {before}
      {marked ? <QuoteShareMark>{marked}</QuoteShareMark> : null}
      {after}
    </>
  );
}

export function DropCapChar({
  char,
  highlightRange,
}: {
  char: string;
  highlightRange: QuoteHighlightRange | null;
}): React.ReactNode {
  if (!highlightRange || highlightRange.start >= highlightRange.end) {
    return char;
  }

  const marked = char.slice(
    highlightRange.start,
    Math.min(char.length, highlightRange.end),
  );
  if (!marked) return char;

  const before = char.slice(0, highlightRange.start);
  const after = char.slice(Math.min(char.length, highlightRange.end));
  return (
    <>
      {before}
      <QuoteShareMark>{marked}</QuoteShareMark>
      {after}
    </>
  );
}
