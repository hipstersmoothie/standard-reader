"use client";

import type { LeafletFacet } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";

import { articleBodyStyles } from "../../body-styles";
import { FacetedPlaintext } from "./faceted-text";

const DEFAULT_CALLOUT_EMOJI = "💡";

export function CalloutBlockView({
  plaintext,
  facets,
  emoji,
  color,
}: {
  plaintext: string;
  facets?: Array<LeafletFacet> | Array<unknown>;
  emoji?: string;
  color?: string;
}) {
  if (!plaintext.trim()) return null;

  return (
    <aside
      {...stylex.props(articleBodyStyles.callout)}
      style={color ? { backgroundColor: color } : undefined}
    >
      <span {...stylex.props(articleBodyStyles.calloutEmoji)} aria-hidden>
        {emoji ?? DEFAULT_CALLOUT_EMOJI}
      </span>
      <p
        {...stylex.props(
          articleBodyStyles.paragraph,
          articleBodyStyles.calloutBody,
        )}
      >
        <FacetedPlaintext plaintext={plaintext} facets={facets} />
      </p>
    </aside>
  );
}
