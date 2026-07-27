import type { Code, Nodes, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

/** A fenced code block extracted from markdown source. */
export interface ExtractedCodeBlock {
  language: string | undefined;
  plaintext: string;
}

// The same remark parser `renderer-core` uses (remark-parse + remark-gfm), so
// the code nodes — and therefore the `codeBlockKey`s we precompute highlights
// for — match what the renderer produces. GFM does not change fenced-code
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
  // A block with no info string has no language to highlight, so there is
  // nothing to precompute. It still renders as a code block — just an
  // unhighlighted one.
  if (!node.lang) return;

  // `renderer-core` passes mdast's `lang` and `value` through untouched, so
  // matching them here keeps `codeBlockKey` in sync and the precomputed
  // highlight is found at render time. The trailing-newline strip is a no-op
  // for remark (which excludes it) and guards against a parser that does not.
  const language = /(\w+)/.exec(node.lang)?.[1];
  out.push({ language, plaintext: node.value.replace(/\n$/, "") });
}

/**
 * Extract every highlightable fenced code block from markdown `text`, in
 * document order, so the server can precompute Shiki highlights for them.
 *
 * Uses the same remark parser as `renderer-core`, so the resulting
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
