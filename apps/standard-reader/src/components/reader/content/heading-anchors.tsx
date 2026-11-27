"use client";

import type { HeadingProps } from "@standard-reader/renderer-react";
import * as stylex from "@stylexjs/stylex";
import { createElement, useMemo } from "react";

import type { HeadingOutlineEntry } from "#/lib/document/heading-outline";

import { articleBodyStyles } from "./body-styles";
import {
  HeadingAnchorContext,
  HeadingAnchorRegistry,
  useHeadingAnchorId,
} from "./heading-anchor-registry";

/** Scopes heading anchor ids to one article body's outline. */
export function HeadingAnchorProvider({
  outline,
  children,
}: {
  outline: ReadonlyArray<HeadingOutlineEntry>;
  children: React.ReactNode;
}) {
  const registry = useMemo(() => new HeadingAnchorRegistry(outline), [outline]);
  return (
    <HeadingAnchorContext value={registry}>{children}</HeadingAnchorContext>
  );
}

/** A `renderer-react` heading, carrying its outline anchor id when it has one. */
export function ArticleHeading({ level, plaintext, children }: HeadingProps) {
  const anchorId = useHeadingAnchorId(plaintext);
  return createElement(
    `h${Math.min(6, Math.max(1, level)).toString()}`,
    {
      id: anchorId,
      ...stylex.props(
        level <= 1 ? articleBodyStyles.heading1 : articleBodyStyles.heading2,
        anchorId != null && articleBodyStyles.headingAnchor,
      ),
    },
    children,
  );
}
