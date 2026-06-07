import * as stylex from "@stylexjs/stylex";
import { articleBodyStyles } from "#/components/reader/content/body-styles";
import { findQuoteTextRange } from "#/lib/quote-highlight-text";

const HIGHLIGHT_NAME = "quote-share";
const HIGHLIGHT_RETRY_MS = 100;
const HIGHLIGHT_MAX_ATTEMPTS = 12;

interface TextNodeSpan {
  node: Text;
  start: number;
  end: number;
}

function collectTextNodes(root: HTMLElement): {
  fullText: string;
  spans: Array<TextNodeSpan>;
} {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const spans: Array<TextNodeSpan> = [];
  let fullText = "";

  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text && current.textContent) {
      const start = fullText.length;
      fullText += current.textContent;
      spans.push({ node: current, start, end: fullText.length });
    }
    current = walker.nextNode();
  }

  return { fullText, spans };
}

function rangeFromOffsets(
  spans: Array<TextNodeSpan>,
  start: number,
  end: number,
): Range | null {
  if (start >= end) return null;

  const range = document.createRange();
  let started = false;

  for (const span of spans) {
    if (!started && start >= span.start && start < span.end) {
      range.setStart(span.node, start - span.start);
      started = true;
    }
    if (started && end > span.start && end <= span.end) {
      range.setEnd(span.node, end - span.start);
      return range;
    }
  }

  return null;
}

/** Find a DOM range matching quote text inside an article body. */
export function findQuoteRange(root: HTMLElement, quote: string): Range | null {
  const trimmed = quote.trim();
  if (!trimmed) return null;

  const { fullText, spans } = collectTextNodes(root);
  if (!fullText) return null;

  const match = findQuoteTextRange(fullText, trimmed);
  if (!match) return null;

  return rangeFromOffsets(spans, match.start, match.end);
}

function findScrollContainer(start: HTMLElement): HTMLElement {
  let node: HTMLElement | null = start;
  while (node) {
    const { overflowY } = globalThis.getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return start;
}

export function scrollQuoteShareMarkIntoView(
  mark: HTMLElement,
  root: HTMLElement,
  options?: { behavior?: ScrollBehavior },
): void {
  const scroller = findScrollContainer(root);
  const markRect = mark.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const markCenter = markRect.top + markRect.height / 2;
  const scrollerCenter = scrollerRect.top + scrollerRect.height / 2;

  scroller.scrollTo({
    top: scroller.scrollTop + (markCenter - scrollerCenter),
    behavior: options?.behavior ?? "instant",
  });
}

function createQuoteShareMark(): HTMLElement {
  const mark = document.createElement("mark");
  mark.dataset.quoteShare = "true";
  const { className } = stylex.props(articleBodyStyles.quoteShareMark);
  if (className) mark.className = className;
  return mark;
}

function wrapRangeInMark(range: Range): HTMLElement | null {
  const mark = createQuoteShareMark();

  try {
    range.surroundContents(mark);
    return mark;
  } catch {
    try {
      const contents = range.extractContents();
      if (!contents.textContent?.trim()) return null;
      mark.append(contents);
      range.insertNode(mark);
      return mark;
    } catch {
      return null;
    }
  }
}

function highlightRangeWithMark(range: Range): HTMLElement | null {
  const mark = wrapRangeInMark(range);
  return mark;
}

/** Highlight quote text in the article body and scroll it into view. */
export function applyQuoteHighlight(root: HTMLElement, quote: string): boolean {
  clearQuoteHighlight();

  const range = findQuoteRange(root, quote);
  if (!range) return false;

  return highlightRangeWithMark(range) !== null;
}

/**
 * Retry highlighting until article content is mounted (images, code blocks, etc.).
 * Returns a cleanup function.
 */
export function applyQuoteHighlightWhenReady(
  root: HTMLElement,
  quote: string,
  onApplied?: () => void,
): () => void {
  let attempts = 0;
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let cancelled = false;

  const tryApply = () => {
    if (cancelled) return;

    if (applyQuoteHighlight(root, quote)) {
      onApplied?.();
      return;
    }

    attempts += 1;
    if (attempts >= HIGHLIGHT_MAX_ATTEMPTS) return;

    timer = globalThis.setTimeout(tryApply, HIGHLIGHT_RETRY_MS);
  };

  timer = globalThis.setTimeout(tryApply, 0);

  return () => {
    cancelled = true;
    if (timer !== null) globalThis.clearTimeout(timer);
  };
}

/** Highlight using character offsets against rendered article plain text. */
export function applyQuoteHighlightByOffsets(
  root: HTMLElement,
  start: number,
  end: number,
): boolean {
  clearQuoteHighlight();

  const { fullText, spans } = collectTextNodes(root);
  if (!fullText || start < 0 || end <= start || end > fullText.length) {
    return false;
  }

  const range = rangeFromOffsets(spans, start, end);
  if (!range) return false;

  return highlightRangeWithMark(range) !== null;
}

export function clearQuoteHighlight(): void {
  const css = globalThis.CSS;
  if (css?.highlights?.has(HIGHLIGHT_NAME)) {
    css.highlights.delete(HIGHLIGHT_NAME);
  }

  for (const mark of document.querySelectorAll("mark[data-quote-share]")) {
    while (mark.firstChild) {
      mark.before(mark.firstChild);
    }
    mark.remove();
  }
}
