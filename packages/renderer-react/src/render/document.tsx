import { buildRenderTree } from "@standard-reader/renderer-core";
import type {
  RendererOptions,
  StandardSiteDocument,
} from "@standard-reader/renderer-core";
import { useMemo } from "react";

import {
  ComponentsProvider,
  FootnoteNumbersProvider,
} from "../components/context";
import { mergeComponents } from "../components/merge";
import type { RendererComponentsInput } from "../components/types";
import { BlockList } from "./blocks";

export interface StandardDocumentRendererProps {
  /** The Standard Site document to render. */
  document: StandardSiteDocument;
  /** Component overrides. Anything omitted uses the unstyled defaults. */
  components?: RendererComponentsInput;
  /** Rendering options (drop cap, leading-image handling, image URLs). */
  options?: RendererOptions;
}

/**
 * Headless renderer for a Standard Site document. Parsing and normalization are
 * done by `@standard-reader/renderer-core`; this component walks the resulting
 * render tree and maps each node to a React component from `components` (falling
 * back to unstyled semantic-HTML defaults).
 */
export function StandardDocumentRenderer({
  document: doc,
  components,
  options,
}: StandardDocumentRendererProps) {
  const merged = useMemo(() => mergeComponents(components), [components]);
  const tree = useMemo(() => buildRenderTree(doc, options), [doc, options]);

  if (!tree) return null;

  const { Root, Footnotes, FootnoteItem, FacetText } = merged.shared;

  return (
    <ComponentsProvider value={merged}>
      <FootnoteNumbersProvider value={tree.footnoteNumbers}>
        <Root>
          <BlockList nodes={tree.children} />
          {tree.footnotes.length > 0 ? (
            <Footnotes>
              {tree.footnotes.map((footnote) => (
                <FootnoteItem
                  key={footnote.id}
                  id={footnote.id}
                  number={footnote.number}
                >
                  <FacetText
                    plaintext={footnote.text.plaintext}
                    facets={footnote.text.facets}
                  />
                </FootnoteItem>
              ))}
            </Footnotes>
          ) : null}
        </Root>
      </FootnoteNumbersProvider>
    </ComponentsProvider>
  );
}
