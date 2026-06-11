"use client";

import { altMarkdownText } from "#/lib/document/structured-content/alt-markdown";

import type { ContentRendererProps } from "../types";

import { MarkdownArticle } from "./shared/markdown-article";

/**
 * Renders markdown-in-record third-party formats (wtr, unthread, lichen, …)
 * through the same sanitized markdown pipeline as `site.standard.content.markdown`.
 * (`at.markpub.markdown` uses the dedicated Markpub renderer instead.)
 */
export function AltMarkdownContentRenderer({
  codeHighlights,
  content,
  hasHero,
}: ContentRendererProps) {
  const text = altMarkdownText(content);
  if (!text) return null;

  return (
    <MarkdownArticle
      text={text}
      hasHero={hasHero}
      codeHighlights={codeHighlights}
    />
  );
}
