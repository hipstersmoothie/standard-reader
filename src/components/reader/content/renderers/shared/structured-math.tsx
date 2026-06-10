"use client";

import * as stylex from "@stylexjs/stylex";
import { renderToString } from "katex";
import { useMemo } from "react";
import "katex/dist/katex.min.css";

import { articleBodyStyles } from "../../body-styles";

export function StructuredMathBlockView({ tex }: { tex: string }) {
  const source = tex.trim();
  const html = useMemo(() => {
    if (!source) return null;
    try {
      return renderToString(source, {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return null;
    }
  }, [source]);

  if (!source) return null;
  if (!html) {
    return (
      <pre {...stylex.props(articleBodyStyles.mathFallback)}>{source}</pre>
    );
  }

  return (
    <div
      {...stylex.props(articleBodyStyles.mathBlock)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
