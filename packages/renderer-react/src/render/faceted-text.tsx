import { Fragment, type ReactNode } from "react";

import { useComponents, useFootnoteNumber } from "../components/context";
import type { FacetTextProps } from "../components/types";
import {
  facetFeatureKind,
  findFacetFeature,
  hasFacetKind,
} from "../core/facets";
import { segmentFacetedText } from "../core/leaflet/facets";

/**
 * The default inline renderer: split a run of plaintext into faceted segments
 * and compose the shared inline mark components over each. Overriding
 * `shared.FacetText` replaces this entirely; overriding an individual mark
 * (e.g. `shared.Link` or `shared.Mention`) customizes one decoration while
 * keeping this composition logic.
 */
export function DefaultFacetText({ plaintext, facets }: FacetTextProps) {
  const segments = segmentFacetedText(plaintext, facets);
  return (
    <>
      {segments.map((segment, index) => (
        <Fragment key={index}>
          <FacetSegment text={segment.text} features={segment.features} />
        </Fragment>
      ))}
    </>
  );
}

function FootnoteRef({
  footnoteId,
  contentPlaintext,
}: {
  footnoteId: string;
  contentPlaintext?: string;
}) {
  const { FootnoteReference } = useComponents().shared;
  const number = useFootnoteNumber(footnoteId);
  return (
    <FootnoteReference
      footnoteId={footnoteId}
      number={number}
      contentPlaintext={contentPlaintext}
    />
  );
}

function FacetSegment({
  text,
  features,
}: {
  text: string;
  features: Array<{
    $type?: string;
    uri?: string;
    did?: string;
    atURI?: string;
    footnoteId?: string;
    contentPlaintext?: string;
  }>;
}) {
  const { shared } = useComponents();

  if (features.length === 0) return <>{text}</>;

  const isBold =
    hasFacetKind(features, "bold") || hasFacetKind(features, "strong");
  const isItalic = hasFacetKind(features, "italic");
  const isCode = hasFacetKind(features, "code");
  const isUnderline = hasFacetKind(features, "underline");
  const isStrikethrough = hasFacetKind(features, "strikethrough");
  const isHighlight = hasFacetKind(features, "highlight");

  // Offprint's `#webMention` is a `#link` enriched with page metadata; render it
  // as a plain link since the plaintext already carries the label.
  const link =
    findFacetFeature(features, "link") ??
    findFacetFeature(features, "webMention");
  const mention =
    findFacetFeature(features, "atMention") ??
    findFacetFeature(features, "didMention") ??
    findFacetFeature(features, "mention");
  const footnote = findFacetFeature(features, "footnote");

  let node: ReactNode = text;

  if (isCode) node = <shared.InlineCode>{node}</shared.InlineCode>;

  if (mention && (mention.atURI || mention.did)) {
    node = (
      <shared.Mention atUri={mention.atURI} did={mention.did}>
        {node}
      </shared.Mention>
    );
  } else if (link?.uri) {
    node = <shared.Link href={link.uri}>{node}</shared.Link>;
  }

  if (isHighlight) node = <shared.Highlight>{node}</shared.Highlight>;
  if (isStrikethrough)
    node = <shared.Strikethrough>{node}</shared.Strikethrough>;
  if (isUnderline) node = <shared.Underline>{node}</shared.Underline>;
  if (isItalic) node = <shared.Emphasis>{node}</shared.Emphasis>;
  if (isBold) node = <shared.Strong>{node}</shared.Strong>;

  if (footnote?.footnoteId) {
    node = (
      <>
        {node}
        <FootnoteRef
          footnoteId={footnote.footnoteId}
          contentPlaintext={footnote.contentPlaintext}
        />
      </>
    );
  }

  return <>{node}</>;
}

/** True when a segment carries any recognized inline formatting. */
export { facetFeatureKind };
