"use client";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { highlightApi } from "#/integrations/tanstack-query/api-highlight.functions";
import { codeBlockKey } from "#/lib/code-highlight";
import { EMPTY_CODE_HIGHLIGHTS, pickCodeHighlight } from '#/lib/theme';
import type { CodeHighlightsByScheme } from '#/lib/theme';
import { useTheme } from "#/lib/use-theme";

import { articleBodyStyles } from "../../body-styles";

function HighlightedCodeShell({ html }: { html: string }) {
  return (
    <div
      data-code-highlight=""
      {...stylex.props(articleBodyStyles.codeBlockShell)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function CodeBlockLazy({
  plaintext,
  language,
  scheme,
}: {
  plaintext: string;
  language: string | undefined;
  scheme: "light" | "dark";
}) {
  const { data: html } = useQuery({
    ...highlightApi.highlightCodeQueryOptions(plaintext, language, scheme),
  });

  if (html) {
    return <HighlightedCodeShell html={html} />;
  }

  return (
    <pre {...stylex.props(articleBodyStyles.codeBlock)}>
      <code>{plaintext}</code>
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

export function CodeBlockView({
  plaintext,
  language,
  codeHighlights = EMPTY_CODE_HIGHLIGHTS,
}: {
  plaintext: string;
  language?: string;
  codeHighlights?: CodeHighlightsByScheme;
}) {
  const { mode, resolvedScheme } = useTheme();

  if (!plaintext) return null;

  if (globalThis.window === undefined && mode === "system") {
    return <PlainCodeBlock plaintext={plaintext} />;
  }

  const key = codeBlockKey({ plaintext, language });
  const serverHtml = pickCodeHighlight(codeHighlights, resolvedScheme, key);

  if (serverHtml) {
    return <HighlightedCodeShell html={serverHtml} />;
  }

  if (mode === "system") {
    return (
      <CodeBlockLazy
        plaintext={plaintext}
        language={language}
        scheme={resolvedScheme}
      />
    );
  }

  return <PlainCodeBlock plaintext={plaintext} />;
}
