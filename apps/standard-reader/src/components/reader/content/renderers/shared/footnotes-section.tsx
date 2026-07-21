"use client";

import { useLingui } from "@lingui/react/macro";
import * as stylex from "@stylexjs/stylex";

import type { LeafletFootnote } from "#/lib/leaflet/footnotes";

import { articleBodyStyles } from "../../body-styles";
import { FacetedPlaintext } from "./faceted-text";

/**
 * Endnotes for a Leaflet document. Leaflet keeps footnote bodies inline on the
 * facet feature that marks each reference, so they're collected up front (see
 * {@link collectLeafletFootnotes}) and rendered here as a numbered list at the
 * end of the body. Each entry back-links to its inline reference.
 */
export function FootnotesSection({
  footnotes,
}: {
  footnotes: Array<LeafletFootnote>;
}) {
  const { t } = useLingui();

  if (footnotes.length === 0) return null;

  return (
    <section
      {...stylex.props(articleBodyStyles.footnotes)}
      aria-label={t`Footnotes`}
    >
      <hr {...stylex.props(articleBodyStyles.footnotesDivider)} />
      <ol {...stylex.props(articleBodyStyles.footnotesList)}>
        {footnotes.map((footnote) => (
          <li
            key={footnote.id}
            id={`fn-${footnote.id}`}
            {...stylex.props(articleBodyStyles.footnotesItem)}
          >
            <FacetedPlaintext
              plaintext={footnote.contentPlaintext}
              facets={footnote.contentFacets}
            />{" "}
            <a
              href={`#fnref-${footnote.id}`}
              aria-label={t`Back to content`}
              {...stylex.props(articleBodyStyles.footnoteBackLink)}
            >
              ↩
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
