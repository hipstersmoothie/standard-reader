import type { LeafletFacet, LeafletFacetFeature } from "./types";
import { sliceUtf8, utf8ByteLength } from "./utf8";

export interface FacetSegment {
  text: string;
  features: Array<LeafletFacetFeature>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFacet(value: unknown): LeafletFacet | null {
  if (!isRecord(value) || !isRecord(value.index)) return null;
  const byteStart = value.index.byteStart;
  const byteEnd = value.index.byteEnd;
  if (typeof byteStart !== "number" || typeof byteEnd !== "number") return null;
  const rawFeatures = value.features;
  if (!Array.isArray(rawFeatures)) return null;
  const features = rawFeatures.filter(
    (feature): feature is LeafletFacetFeature =>
      isRecord(feature) && typeof feature.$type === "string",
  );
  return { index: { byteStart, byteEnd }, features };
}

function parseFacets(facets: Array<unknown> | undefined): Array<LeafletFacet> {
  if (!facets?.length) return [];
  return facets
    .map((facet) => parseFacet(facet))
    .filter((facet): facet is LeafletFacet => facet != null)
    .toSorted((a, b) => a.index.byteStart - b.index.byteStart);
}

/** Shift facet byte indices after removing a leading prefix from plaintext. */
export function shiftFacets(
  facets: Array<unknown> | undefined,
  byteOffset: number,
): Array<LeafletFacet> {
  if (byteOffset <= 0) return parseFacets(facets);
  return parseFacets(facets)
    .map((facet) => ({
      ...facet,
      index: {
        byteStart: Math.max(0, facet.index.byteStart - byteOffset),
        byteEnd: Math.max(0, facet.index.byteEnd - byteOffset),
      },
    }))
    .filter((facet) => facet.index.byteEnd > facet.index.byteStart);
}

/** Split plaintext into styled segments using Leaflet/AT Proto UTF-8 byte facets. */
export function segmentFacetedText(
  plaintext: string,
  facets?: Array<unknown> | Array<LeafletFacet>,
): Array<FacetSegment> {
  const parsed =
    Array.isArray(facets) &&
    facets[0] != null &&
    isRecord(facets[0]) &&
    "index" in facets[0]
      ? (facets as Array<LeafletFacet>)
      : parseFacets(facets as Array<unknown> | undefined);

  if (!plaintext) return [];
  if (parsed.length === 0) return [{ text: plaintext, features: [] }];

  const segments: Array<FacetSegment> = [];
  let bytePos = 0;
  const totalBytes = utf8ByteLength(plaintext);

  for (const facet of parsed) {
    const { byteStart, byteEnd } = facet.index;
    if (byteStart > bytePos) {
      segments.push({
        text: sliceUtf8(plaintext, bytePos, byteStart),
        features: [],
      });
    }
    if (byteEnd > byteStart) {
      segments.push({
        text: sliceUtf8(plaintext, byteStart, byteEnd),
        features: facet.features,
      });
    }
    bytePos = Math.max(bytePos, byteEnd);
  }

  if (bytePos < totalBytes) {
    segments.push({
      text: sliceUtf8(plaintext, bytePos, totalBytes),
      features: [],
    });
  }

  return segments.filter((segment) => segment.text.length > 0);
}
