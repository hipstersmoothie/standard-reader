import { blockAncestor } from "#/lib/page-reader/word-highlight";

/**
 * Page chrome and non-content regions excluded from narration. Matches are
 * checked with `closest`, so anything inside these is skipped too.
 */
const SKIP_SELECTOR = [
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "button",
  "iframe",
  "[aria-hidden='true']",
  "[hidden]",
  "[role='navigation']",
  "[role='banner']",
  "[role='contentinfo']",
  "[role='complementary']",
  "[data-reader-skip]",
].join(", ");

/** Minimum extracted length to count as a usable article body. */
const MIN_TEXT_CHARS = 280;

function articleRoot(): HTMLElement {
  const candidates = ["article", "main", "[role='main']"];
  for (const selector of candidates) {
    const el = document.querySelector(selector);
    if (el instanceof HTMLElement && el.textContent.trim().length > 0) {
      return el;
    }
  }
  return document.body;
}

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true;
  if (typeof el.checkVisibility === "function") return el.checkVisibility();
  return true;
}

/**
 * Narration text extracted from the live page, for articles whose indexed
 * record has no (or only a truncated) body. The walk mirrors the read-along
 * highlighter's `collectTextNodes` — same root-to-leaf text order, with block
 * boundaries becoming paragraph breaks — so the synthesized sentences align
 * 1:1 with the page DOM and the highlight tracks perfectly. The text never
 * leaves the browser: it goes content script → background → offscreen TTS.
 */
export function extractPageText(): string | null {
  const root = articleRoot();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let text = "";
  let prevBlock: Element | null = null;
  let current = walker.nextNode();
  while (current) {
    const parent = current.parentElement;
    if (
      current instanceof Text &&
      current.textContent.trim() &&
      parent &&
      !parent.closest(SKIP_SELECTOR) &&
      !parent.closest("script, style, noscript") &&
      isVisible(parent)
    ) {
      const block = blockAncestor(current);
      if (text && block !== prevBlock) text += "\n";
      prevBlock = block;
      text += current.textContent;
    }
    current = walker.nextNode();
  }

  // Collapse intra-paragraph whitespace; drop empty lines.
  const cleaned = text
    .split("\n")
    .map((line) => line.replaceAll(/\s+/gu, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");

  return cleaned.length >= MIN_TEXT_CHARS ? cleaned : null;
}
