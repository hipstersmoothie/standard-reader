"use client";

import type { LeafletMathBlock } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { renderToString } from "katex";
import { useMemo } from "react";
import "katex/dist/katex.min.css";

import { articleBodyStyles } from "../body-styles";

export function LeafletMathBlockView({ block }: { block: LeafletMathBlock }) {
  const tex = block.tex?.trim() ?? "";
  const html = useMemo(() => {
    if (!tex) return null;
    try {
      return renderToString(tex, {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return null;
    }
  }, [tex]);

  if (!tex) return null;
  if (!html) {
    return <pre {...stylex.props(articleBodyStyles.mathFallback)}>{tex}</pre>;
  }

  return (
    <div
      {...stylex.props(articleBodyStyles.mathBlock)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
