"use client";

import type { LeafletFacet } from "#/lib/leaflet/types";
import type { QuoteHighlightRange } from "#/lib/quote-highlight-text";

import * as stylex from "@stylexjs/stylex";
import { AppLink } from "#/components/reader/app-link";
import {
  DropCapChar,
  QuoteShareMark,
} from "#/components/reader/quote-highlight-context";
import {
  intersectHighlightRange,
  useQuoteHighlightTracker,
} from "#/components/reader/quote-highlight-tracker";
import { authorProfilePath } from "#/lib/author-profile";
import { segmentFacetedText, shiftFacets } from "#/lib/leaflet/facets";
import { utf8ByteLength } from "#/lib/leaflet/utf8";
import { useReadingTypography } from "#/lib/use-reading-typography";
import { Fragment } from "react";

import type { FacetFeature } from "./facets";

import { articleBodyStyles, readingDropCapStyleProps } from "../../body-styles";
import { findFacetFeature, hasFacetKind } from "./facets";

function FacetSegment({
  text,
  features,
}: {
  text: string;
  features: Array<FacetFeature>;
}) {
  if (features.length === 0) return <>{text}</>;

  const isBold =
    hasFacetKind(features, "bold") || hasFacetKind(features, "strong");
  const isItalic = hasFacetKind(features, "italic");
  const isCode = hasFacetKind(features, "code");
  const isUnderline = hasFacetKind(features, "underline");
  const isStrikethrough = hasFacetKind(features, "strikethrough");
  const isHighlight = hasFacetKind(features, "highlight");
  const link = findFacetFeature(features, "link");
  const didMention =
    findFacetFeature(features, "didMention") ??
    findFacetFeature(features, "mention");

  let node: React.ReactNode = text;

  if (isCode) {
    node = <code {...stylex.props(articleBodyStyles.facetCode)}>{text}</code>;
  }

  if (link?.uri) {
    node = (
      <AppLink href={link.uri} linkStyle={articleBodyStyles.facetLink}>
        {text}
      </AppLink>
    );
  } else if (didMention?.did) {
    node = (
      <AppLink
        href={authorProfilePath(didMention.did)}
        linkStyle={articleBodyStyles.facetMentionLink}
      >
        {text}
      </AppLink>
    );
  }

  if (isHighlight) {
    node = (
      <mark {...stylex.props(articleBodyStyles.facetHighlight)}>{node}</mark>
    );
  }

  if (isStrikethrough) {
    node = (
      <s {...stylex.props(articleBodyStyles.facetStrikethrough)}>{node}</s>
    );
  }

  if (isUnderline) {
    node = <u {...stylex.props(articleBodyStyles.facetUnderline)}>{node}</u>;
  }

  if (isItalic) {
    node = <em {...stylex.props(articleBodyStyles.facetItalic)}>{node}</em>;
  }

  if (isBold) {
    node = (
      <strong {...stylex.props(articleBodyStyles.facetBold)}>{node}</strong>
    );
  }

  return <>{node}</>;
}

export function FacetedPlaintext({
  plaintext,
  facets,
}: {
  plaintext: string;
  facets?: Array<LeafletFacet> | Array<unknown>;
}) {
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

function facetsForSlice(
  facets: Array<LeafletFacet> | Array<unknown> | undefined,
  plaintext: string,
  sliceStart: number,
): Array<LeafletFacet> | Array<unknown> | undefined {
  if (!facets?.length || sliceStart <= 0) return facets;
  const byteOffset = utf8ByteLength(plaintext.slice(0, sliceStart));
  return shiftFacets(facets, byteOffset);
}

export function HighlightedFacetedPlaintext({
  plaintext,
  facets,
  highlightRange,
}: {
  plaintext: string;
  facets?: Array<LeafletFacet> | Array<unknown>;
  highlightRange: QuoteHighlightRange | null;
}) {
  if (!highlightRange || highlightRange.start >= highlightRange.end) {
    return <FacetedPlaintext plaintext={plaintext} facets={facets} />;
  }

  const { start, end } = highlightRange;
  const slices = [
    { sliceStart: 0, sliceEnd: start, mark: false },
    { sliceStart: start, sliceEnd: end, mark: true },
    { sliceStart: end, sliceEnd: plaintext.length, mark: false },
  ].filter((slice) => slice.sliceEnd > slice.sliceStart);

  return (
    <>
      {slices.map((slice) => {
        const text = plaintext.slice(slice.sliceStart, slice.sliceEnd);
        const sliceFacets = facetsForSlice(facets, plaintext, slice.sliceStart);
        const content = (
          <FacetedPlaintext plaintext={text} facets={sliceFacets} />
        );

        return slice.mark ? (
          <QuoteShareMark key={`${slice.sliceStart}-${slice.sliceEnd}`}>
            {content}
          </QuoteShareMark>
        ) : (
          <Fragment key={`${slice.sliceStart}-${slice.sliceEnd}`}>
            {content}
          </Fragment>
        );
      })}
    </>
  );
}

export function TextBlockView({
  plaintext,
  facets,
  dropCap = false,
  embedded = false,
}: {
  plaintext: string;
  facets?: Array<LeafletFacet> | Array<unknown>;
  dropCap?: boolean;
  embedded?: boolean;
}) {
  const tracker = useQuoteHighlightTracker();
  const { preference } = useReadingTypography();
  const highlightRange = tracker?.consume(plaintext.length) ?? null;

  if (!plaintext) return null;

  const paragraphStyle = embedded
    ? articleBodyStyles.pageEmbedBlockSpacing
    : articleBodyStyles.paragraph;

  if (dropCap) {
    const chars = [...plaintext];
    const firstChar = chars[0] ?? "";
    const rest = chars.slice(1).join("");
    const byteOffset = utf8ByteLength(firstChar);
    const firstCharRange = intersectHighlightRange(highlightRange, 0, 1);
    const restRange = intersectHighlightRange(
      highlightRange,
      1,
      Math.max(0, plaintext.length - 1),
    );

    return (
      <p {...stylex.props(paragraphStyle, articleBodyStyles.dropCapParagraph)}>
        <span {...readingDropCapStyleProps(preference)} aria-hidden>
          <DropCapChar char={firstChar} highlightRange={firstCharRange} />
        </span>
        <HighlightedFacetedPlaintext
          plaintext={rest}
          facets={shiftFacets(facets, byteOffset)}
          highlightRange={restRange}
        />
      </p>
    );
  }

  return (
    <p {...stylex.props(paragraphStyle)}>
      <HighlightedFacetedPlaintext
        plaintext={plaintext}
        facets={facets}
        highlightRange={highlightRange}
      />
    </p>
  );
}
