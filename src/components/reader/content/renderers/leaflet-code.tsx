"use client";

import type { LeafletCodeBlock } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { codeBlockKey } from "#/lib/code-highlight";
import {
  EMPTY_CODE_HIGHLIGHTS,
  pickCodeHighlight,
  type CodeHighlightsByScheme,
} from "#/lib/theme";
import { useTheme } from "#/lib/use-theme";
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

function LeafletCodeBlockLazy({
  block,
  scheme,
}: {
  block: LeafletCodeBlock;
  scheme: "light" | "dark";
}) {
  const { data: html } = useQuery({
    ...highlightApi.highlightCodeQueryOptions(
      block.plaintext,
      block.language,
      scheme,
    ),
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

function PlainCodeBlock({ plaintext }: { plaintext: string }) {
  return (
    <pre {...stylex.props(articleBodyStyles.codeBlock)}>
      <code>{plaintext}</code>
    </pre>
  );
}

export function LeafletCodeBlockView({
  block,
  codeHighlights = EMPTY_CODE_HIGHLIGHTS,
}: {
  block: LeafletCodeBlock;
  codeHighlights?: CodeHighlightsByScheme;
}) {
  const { mode, resolvedScheme } = useTheme();

  if (!block.plaintext) return null;

  // SSR cannot know OS preference for `system`; defer themed markup to the client.
  if (globalThis.window === undefined && mode === "system") {
    return <PlainCodeBlock plaintext={block.plaintext} />;
  }

  const key = codeBlockKey(block);
  const serverHtml = pickCodeHighlight(codeHighlights, resolvedScheme, key);

  if (serverHtml) {
    return <HighlightedCodeShell html={serverHtml} />;
  }

  if (mode === "system") {
    return <LeafletCodeBlockLazy block={block} scheme={resolvedScheme} />;
  }

  return <PlainCodeBlock plaintext={block.plaintext} />;
}
