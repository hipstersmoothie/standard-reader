/**
 * Karaoke-style word highlighting for the page reader. We align the engine's
 * narration sentences to the article's rendered DOM (word by word) and paint the
 * active word with the CSS Custom Highlight API — no per-frame DOM mutation, so
 * it's cheap to move the highlight every animation frame.
 */

/** Registered name for the custom highlight (see the `::highlight()` rule). */
const HIGHLIGHT_NAME = "reader-word";

interface TextNodeSpan {
  node: Text;
  start: number;
  end: number;
}

/** A real word in the DOM: its char offsets in `fullText` and a normal form. */
interface WordToken {
  start: number;
  end: number;
  norm: string;
}

/** A narration sentence's run of DOM word-tokens, with timing weights. */
export interface SentenceRun {
  /** Global index of the run's first word in `tokens`. */
  first: number;
  count: number;
  /**
   * Cumulative character weight at each word boundary (length `count + 1`,
   * `cum[0] === 0`). Used to map a sentence's audio fraction to a word by
   * distributing the sentence's duration across characters (longer words get
   * proportionally more time), per the chunk-duration approximation.
   */
  cum: Array<number>;
  total: number;
}

export interface HighlightMap {
  spans: Array<TextNodeSpan>;
  tokens: Array<WordToken>;
  /** Per narration sentence: its word run (null if not found in the DOM). */
  sentenceTokens: Array<SentenceRun | null>;
}

interface HighlightLike {
  add(range: Range): void;
  clear(): void;
}

interface HighlightRegistryLike {
  set(name: string, highlight: HighlightLike): void;
  delete(name: string): void;
}

/**
 * Nearest ancestor that introduces a layout boundary for a text node — i.e. the
 * closest non-inline, non-floated block. Floated elements (e.g. drop caps) and
 * inline elements (links, emphasis) are skipped so they stay glued to their
 * surrounding text rather than forming a word boundary.
 */
function blockAncestor(node: Node): Element | null {
  let el = node.parentElement;
  while (el) {
    const style = globalThis.getComputedStyle(el);
    const inline =
      style.display.startsWith("inline") || style.display === "contents";
    if (!inline && style.cssFloat === "none") return el;
    el = el.parentElement;
  }
  return null;
}

function collectTextNodes(root: HTMLElement): {
  fullText: string;
  spans: Array<TextNodeSpan>;
} {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const spans: Array<TextNodeSpan> = [];
  let fullText = "";
  let prevBlock: Element | null = null;

  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text && current.textContent) {
      // Insert a separator (owned by no span) across block boundaries so words
      // from adjacent blocks (kicker→title, title→dek, …) don't fuse into one
      // token. Inline/floated boundaries are left glued.
      const block = blockAncestor(current);
      if (fullText && block !== prevBlock) fullText += "\n";
      prevBlock = block;

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

/** Lowercased, punctuation-stripped form for matching DOM ↔ speech words. */
function normalizeWord(word: string): string {
  return word.toLowerCase().replaceAll(/[^\p{L}\p{N}]+/gu, "");
}

/** Split a string into real words (offsets in DOM text, dropping punctuation-only). */
function tokenizeWithOffsets(text: string): Array<WordToken> {
  const tokens: Array<WordToken> = [];
  const regex = /\S+/gu;
  let match = regex.exec(text);
  while (match) {
    const norm = normalizeWord(match[0]);
    if (norm) {
      tokens.push({
        start: match.index,
        end: match.index + match[0].length,
        norm,
      });
    }
    match = regex.exec(text);
  }
  return tokens;
}

/** Normalized words of a sentence (no offsets needed). */
function sentenceWords(sentence: string): Array<string> {
  const words: Array<string> = [];
  for (const raw of sentence.split(/\s+/u)) {
    const norm = normalizeWord(raw);
    if (norm) words.push(norm);
  }
  return words;
}

/** First index in `tokens` (from `from`) where `words` matches consecutively. */
function findSequence(
  tokens: Array<WordToken>,
  words: Array<string>,
  from: number,
): number {
  const limit = tokens.length - words.length;
  for (let i = from; i <= limit; i++) {
    let matched = true;
    for (let k = 0; k < words.length; k++) {
      if (tokens[i + k].norm !== words[k]) {
        matched = false;
        break;
      }
    }
    if (matched) return i;
  }
  return -1;
}

/**
 * Build the sentence→word map by walking the article DOM once and locating each
 * narration sentence's word run. Sentences that don't appear in the DOM (e.g.
 * the synthesized "By {author}." byline) are left unmatched and simply skipped.
 */
export function buildHighlightMap(
  root: HTMLElement,
  sentences: Array<string>,
): HighlightMap {
  const { fullText, spans } = collectTextNodes(root);
  const tokens = tokenizeWithOffsets(fullText);
  const sentenceTokens: HighlightMap["sentenceTokens"] = [];

  let cursor = 0;
  for (const sentence of sentences) {
    const words = sentenceWords(sentence);
    if (words.length === 0) {
      sentenceTokens.push(null);
      continue;
    }
    const first = findSequence(tokens, words, cursor);
    if (first === -1) {
      sentenceTokens.push(null);
      continue;
    }

    // Weight each word by its character length (+1 for the following space) so a
    // sentence's audio time is distributed across characters, not evenly.
    const cum = [0];
    let total = 0;
    for (let k = 0; k < words.length; k++) {
      const token = tokens[first + k];
      total += token.end - token.start + 1;
      cum.push(total);
    }
    sentenceTokens.push({ first, count: words.length, cum, total });
    cursor = first + words.length;
  }

  return { spans, tokens, sentenceTokens };
}

/**
 * Global token index for the word at `fraction` (0..1) through a sentence's
 * audio, choosing the word whose character span contains that position.
 */
export function tokenIndexForProgress(
  run: SentenceRun,
  fraction: number,
): number {
  const target = fraction * run.total;
  for (let i = 0; i < run.count; i++) {
    if (target < run.cum[i + 1]) return run.first + i;
  }
  return run.first + run.count - 1;
}

/** How many sentences were located in the DOM (used to gate retries). */
export function matchedSentenceCount(map: HighlightMap): number {
  return map.sentenceTokens.filter(Boolean).length;
}

/** DOM range for the given global word-token index, if still resolvable. */
export function rangeForToken(map: HighlightMap, index: number): Range | null {
  const token = map.tokens[index];
  if (!token) return null;
  return rangeFromOffsets(map.spans, token.start, token.end);
}

/** DOM range covering a sentence's whole word run, if still resolvable. */
export function rangeForSentence(
  map: HighlightMap,
  run: SentenceRun,
): Range | null {
  const first = map.tokens[run.first];
  const last = map.tokens[run.first + run.count - 1];
  if (!first || !last) return null;
  return rangeFromOffsets(map.spans, first.start, last.end);
}

let activeHighlight: HighlightLike | null = null;

function highlightRegistry(): HighlightRegistryLike | undefined {
  return (globalThis.CSS as unknown as { highlights?: HighlightRegistryLike })
    ?.highlights;
}

/** Paint a single word; returns false when the browser lacks the API. */
export function setWordHighlight(range: Range): boolean {
  const registry = highlightRegistry();
  const Ctor = (
    globalThis as unknown as {
      Highlight?: new (...ranges: Array<Range>) => HighlightLike;
    }
  ).Highlight;
  if (!registry || !Ctor) return false;

  if (!activeHighlight) {
    activeHighlight = new Ctor();
    registry.set(HIGHLIGHT_NAME, activeHighlight);
  }
  activeHighlight.clear();
  activeHighlight.add(range);
  return true;
}

export function clearWordHighlight(): void {
  highlightRegistry()?.delete(HIGHLIGHT_NAME);
  activeHighlight = null;
}

/** Scroll containers the user may move while reading (inner body + app shell). */
export function articleScrollContainers(root: HTMLElement): Array<HTMLElement> {
  const inner = findScrollContainer(root);
  const outer = root.closest("[data-app-scroller]");
  if (outer instanceof HTMLElement && outer !== inner) {
    return [inner, outer];
  }
  return [inner];
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

/** Keep the active word within a comfortable band of its scroll container. */
export function scrollWordIntoView(range: Range, root: HTMLElement): void {
  const scroller = findScrollContainer(root);
  const word = range.getBoundingClientRect();
  if (word.width === 0 && word.height === 0) return;

  const view = scroller.getBoundingClientRect();
  const topBand = view.top + view.height * 0.2;
  const bottomBand = view.top + view.height * 0.75;
  if (word.top >= topBand && word.bottom <= bottomBand) return;

  const target = view.top + view.height * 0.4;
  scroller.scrollTo({
    top: scroller.scrollTop + (word.top - target),
    behavior: "smooth",
  });
}
