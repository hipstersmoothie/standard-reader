import type { Code, Nodes, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/** A fenced code block extracted from markdown source. */
export interface ExtractedCodeBlock {
  language: string | undefined;
  plaintext: string;
}

// Same parser react-markdown uses (remark-parse + remark-gfm) so the code
// nodes — and therefore the `codeBlockKey`s we precompute highlights for —
// match what `MarkdownArticle` renders. GFM does not change fenced-code
// tokenization, but keeping it in step avoids any drift.
const processor = unified().use(remarkParse).use(remarkGfm);

function walk(node: Nodes, out: Array<ExtractedCodeBlock>): void {
  if (node.type === "code") {
    pushCodeBlock(node, out);
    return;
  }
  if ("children" in node) {
    for (const child of node.children) walk(child, out);
  }
}

function pushCodeBlock(node: Code, out: Array<ExtractedCodeBlock>): void {
  // `MarkdownArticle` only renders a `CodeBlockView` (the highlightable path)
  // when react-markdown emits `class="language-<lang>"`, which happens only
  // for fenced blocks that carry an info string. A languageless block renders
  // as inline `<code>` and is never highlighted, so skip it here too.
  if (!node.lang) return;

  // Mirror the renderer's own derivation exactly: it reads the language from
  // `className` via `/language-(\w+)/`, and strips a single trailing newline
  // from the text. Matching both keeps `codeBlockKey` in sync so the
  // precomputed highlight is actually found at render time.
  const className = `language-${node.lang}`;
  const language = /language-(\w+)/.exec(className)?.[1];
  out.push({ language, plaintext: node.value.replace(/\n$/, "") });
}

/**
 * Extract every highlightable fenced code block from markdown `text`, in
 * document order, so the server can precompute Shiki highlights for them.
 *
 * Uses the same remark parser as `MarkdownArticle`, so the resulting
 * `{ language, plaintext }` pairs produce the same `codeBlockKey` the renderer
 * looks up — without this, markdown articles only get highlighted via the
 * client lazy-fetch fallback, which never runs outside `system` theme mode.
 */
export function extractMarkdownCodeBlocks(
  text: string,
): Array<ExtractedCodeBlock> {
  if (!text.trim()) return [];
  const tree = processor.parse(text) as Root;
  const out: Array<ExtractedCodeBlock> = [];
  walk(tree, out);
  return out;
}
