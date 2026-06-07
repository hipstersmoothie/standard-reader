"use client";

import type { LeafletFacet } from "#/lib/leaflet/types";

import * as stylex from "@stylexjs/stylex";
import { segmentFacetedText, shiftFacets } from "#/lib/leaflet/facets";
import { utf8ByteLength } from "#/lib/leaflet/utf8";
import { Fragment } from "react";

import type { FacetFeature } from "./facets";

import { articleBodyStyles } from "../../body-styles";
import { findFacetFeature, hasFacetKind } from "./facets";

function FacetSegment({
  text,
  features,
}: {
  text: string;
  features: Array<FacetFeature>;
}) {
  if (features.length === 0) return <>{text}</>;

  const isBold = hasFacetKind(features, "bold");
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
      <a
        href={link.uri}
        target="_blank"
        rel="noreferrer"
        {...stylex.props(articleBodyStyles.facetLink)}
      >
        {text}
      </a>
    );
  } else if (didMention?.did) {
    node = (
      <a
        href={`https://bsky.app/profile/${didMention.did}`}
        target="_blank"
        rel="noreferrer"
        {...stylex.props(articleBodyStyles.facetLink)}
      >
        {text}
      </a>
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

export function TextBlockView({
  plaintext,
  facets,
  dropCap = false,
}: {
  plaintext: string;
  facets?: Array<LeafletFacet> | Array<unknown>;
  dropCap?: boolean;
}) {
  if (!plaintext) return null;

  if (dropCap) {
    const chars = [...plaintext];
    const firstChar = chars[0] ?? "";
    const rest = chars.slice(1).join("");
    const byteOffset = utf8ByteLength(firstChar);

    return (
      <p
        {...stylex.props(
          articleBodyStyles.paragraph,
          articleBodyStyles.dropCapParagraph,
        )}
      >
        <span {...stylex.props(articleBodyStyles.dropCap)} aria-hidden>
          {firstChar}
        </span>
        <FacetedPlaintext
          plaintext={rest}
          facets={shiftFacets(facets, byteOffset)}
        />
      </p>
    );
  }

  return (
    <p {...stylex.props(articleBodyStyles.paragraph)}>
      <FacetedPlaintext plaintext={plaintext} facets={facets} />
    </p>
  );
}
