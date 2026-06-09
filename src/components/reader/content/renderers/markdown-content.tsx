"use client";

import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";

import type { ContentRendererProps } from "../types";

import { MarkdownArticle } from "./shared/markdown-article";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function markdownText(content: unknown): string | null {
  if (!isRecord(content) || content.$type !== STANDARD_MARKDOWN_CONTENT) {
    return null;
  }
  return typeof content.text === "string" ? content.text : null;
}

/** Renders `site.standard.content.markdown` (including resolved GreenGale docs). */
export function MarkdownContentRenderer({
  codeHighlights,
  content,
  hasHero,
}: ContentRendererProps) {
  const text = markdownText(content);
  if (!text?.trim()) return null;

  return (
    <MarkdownArticle
      text={text}
      hasHero={hasHero}
      codeHighlights={codeHighlights}
    />
  );
}

export { STANDARD_MARKDOWN_CONTENT };
