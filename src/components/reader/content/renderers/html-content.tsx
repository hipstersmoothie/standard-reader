"use client";

import { htmlContentBody } from "#/lib/document/structured-content/html";

import type { ContentRendererProps } from "../types";

import { MarkdownArticle } from "./shared/markdown-article";

/**
 * Renders HTML-in-record formats (WordPress, Known/idno, Ghost-style,
 * Gutenberg, the standard `#html` variant).
 *
 * The raw HTML is fed through the shared article pipeline where `rehype-raw`
 * re-parses it and `rehype-sanitize` strips everything outside the article
 * schema (scripts, event handlers, unknown tags/attributes) before any DOM is
 * produced — untrusted markup is never injected directly.
 */
export function HtmlContentRenderer({
  codeHighlights,
  content,
  hasHero,
  skipFirstBlock,
}: ContentRendererProps) {
  const html = htmlContentBody(content);
  if (!html) return null;

  return (
    <MarkdownArticle
      text={html}
      hasHero={hasHero}
      skipFirstBlock={skipFirstBlock}
      codeHighlights={codeHighlights}
    />
  );
}
