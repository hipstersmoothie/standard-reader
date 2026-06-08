"use client";

import type { QuoteHighlightRange } from "#/lib/quote-highlight-text";
import type { CodeHighlightsByScheme } from "#/lib/theme";

import * as stylex from "@stylexjs/stylex";
import { useQuery } from "@tanstack/react-query";
import { HighlightedPlaintext } from "#/components/reader/quote-highlight-context";
import { useQuoteHighlightTracker } from "#/components/reader/quote-highlight-tracker";
import { highlightApi } from "#/integrations/tanstack-query/api-highlight.functions";
import { codeBlockKey } from "#/lib/code-highlight";
import { EMPTY_CODE_HIGHLIGHTS, pickCodeHighlight } from "#/lib/theme";
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

function PlainCodeBlock({
  plaintext,
  highlightRange,
}: {
  plaintext: string;
  highlightRange: QuoteHighlightRange | null;
}) {
  return (
    <pre {...stylex.props(articleBodyStyles.codeBlock)}>
      <code>
        <HighlightedPlaintext
          plaintext={plaintext}
          highlightRange={highlightRange}
        />
      </code>
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
  const tracker = useQuoteHighlightTracker();
  const highlightRange = tracker?.consume(plaintext.length) ?? null;

  if (!plaintext) return null;

  // Quote marks must match between SSR and hydration — highlighted HTML shells
  // cannot carry share marks, so keep plain text while a range is active.
  if (highlightRange) {
    return (
      <PlainCodeBlock plaintext={plaintext} highlightRange={highlightRange} />
    );
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

  return <PlainCodeBlock plaintext={plaintext} highlightRange={null} />;
}
