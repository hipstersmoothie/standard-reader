"use client";

import type { LeafletCodeBlock } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { codeBlockKey } from "#/lib/code-highlight";
import { highlightApi } from "#/integrations/tanstack-query/api-highlight.functions";

import { articleBodyStyles } from "../body-styles";

function HighlightedCodeShell({ html }: { html: string }) {
  return (
    <div
      data-code-highlight=""
      {...stylex.props(articleBodyStyles.codeBlockShell)}
      // Shiki emits trusted server-generated markup (no user HTML).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function LeafletCodeBlockLazy({ block }: { block: LeafletCodeBlock }) {
  const { data: html } = useQuery({
    ...highlightApi.highlightCodeQueryOptions(block.plaintext, block.language),
  });

  if (html) {
    return <HighlightedCodeShell html={html} />;
  }

  return (
    <pre {...stylex.props(articleBodyStyles.codeBlock)}>
      <code>{block.plaintext}</code>
    </pre>
  );
}

export function LeafletCodeBlockView({
  block,
  codeHighlights,
}: {
  block: LeafletCodeBlock;
  codeHighlights?: Record<string, string>;
}) {
  if (!block.plaintext) return null;

  const serverHtml = codeHighlights?.[codeBlockKey(block)];
  if (serverHtml) {
    return <HighlightedCodeShell html={serverHtml} />;
  }

  return <LeafletCodeBlockLazy block={block} />;
}
