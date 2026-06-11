"use client";

import { prepareMarkpubMarkdown } from "#/lib/markpub/markdown";

import type { ContentRendererProps } from "../types";

import { MarkdownArticle } from "./shared/markdown-article";

/** Renders `at.markpub.markdown` with flavor, extensions, facets, and lenses. */
export function MarkpubContentRenderer({
  codeHighlights,
  content,
  hasHero,
}: ContentRendererProps) {
  const prepared = prepareMarkpubMarkdown(content);
  if (!prepared) return null;

  return (
    <MarkdownArticle
      text={prepared.body}
      hasHero={hasHero}
      codeHighlights={codeHighlights}
      flavor={prepared.flavor}
      enableMath={prepared.enableMath}
    />
  );
}
