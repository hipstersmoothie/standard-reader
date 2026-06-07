"use client";

import type { LeafletFacet } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { createElement } from "react";

import { articleBodyStyles } from "../../body-styles";
import { FacetedPlaintext } from "./faceted-text";

export function HeadingBlockView({
  plaintext,
  level = 2,
  facets,
}: {
  plaintext: string;
  level?: number;
  facets?: Array<LeafletFacet> | Array<unknown>;
}) {
  if (!plaintext) return null;
  const clamped = Math.min(6, Math.max(1, level));
  const style =
    clamped <= 1 ? articleBodyStyles.heading1 : articleBodyStyles.heading2;

  return createElement(
    `h${clamped}`,
    { ...stylex.props(style) },
    facets?.length ? (
      <FacetedPlaintext plaintext={plaintext} facets={facets} />
    ) : (
      plaintext
    ),
  );
}
