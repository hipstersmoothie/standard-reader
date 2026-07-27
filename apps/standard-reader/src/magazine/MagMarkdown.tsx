"use client";

import type { ComponentProps } from "react";
import { mergeProps } from "react-aria";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useMagHover } from "./use-mag-hover";

function MagMarkdownLink({ href, children, ...props }: ComponentProps<"a">) {
  const { hoverProps, isHovered } = useMagHover();
  return (
    <a
      href={href}
      {...mergeProps(props, hoverProps)}
      data-hovered={isHovered || undefined}
    >
      {children}
    </a>
  );
}

/**
 * Minimal markdown for magazine editorial intros and per-piece notes. Renders
 * plain HTML elements that inherit the magazine surface (`--serif`, `--ink`, …)
 * via `magazine.css`, avoiding the heavier article-body renderer and its
 * reading-typography context.
 */
export function MagMarkdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: MagMarkdownLink }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
