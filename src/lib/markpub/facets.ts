import type { LeafletFacet, LeafletFacetFeature } from "#/lib/leaflet/types";

import { sliceUtf8, utf8ByteLength } from "#/lib/leaflet/utf8";

import type { MarkpubLens } from "./types";

function facetFeatureKind($type: string | undefined): string | null {
  if (!$type) return null;
  const hash = $type.indexOf("#");
  if (hash === -1) return null;
  return $type.slice(hash + 1);
}

const MARKPUB_STRONG = "at.markpub.facets.baseFormatting#strong";
const MARKPUB_HEADER = "at.markpub.facets.baseFormatting#header";
const MARKPUB_IDIFY = "at.markpub.facets.baseFormatting#idify";
const MARKPUB_YAML = "at.markpub.facets.baseBlocks#yaml-front-matter";
const MARKPUB_HR = "at.markpub.facets.baseBlocks#horizontalRule";
const MARKPUB_RAW = "at.markpub.facets.baseBlocks#raw";

/** Canonical facet kinds this renderer understands after lens normalization. */
const KNOWN_FACET_ALIASES: Record<string, string> = {
  strong: "strong",
  bold: "strong",
  header: "header",
  idify: "idify",
  "yaml-front-matter": "yaml-front-matter",
  horizontalRule: "horizontalRule",
  raw: "raw",
  link: "link",
  italic: "italic",
  code: "code",
  underline: "underline",
  strikethrough: "strikethrough",
  highlight: "highlight",
  mention: "mention",
  didMention: "mention",
};

function featureKind(feature: LeafletFacetFeature): string | null {
  const kind = facetFeatureKind(feature.$type);
  return kind ? (KNOWN_FACET_ALIASES[kind] ?? kind) : null;
}

function buildLensMap(lenses: Array<MarkpubLens>): Map<string, string> {
  const map = new Map<string, string>();
  for (const lens of lenses) {
    const types = lens.facets
      .map((facet) => facet.$type)
      .filter((type): type is string => typeof type === "string");
    if (types.length < 2) continue;
    const canonical = featureKind({ $type: types[0] }) ?? types[0];
    for (const type of types) {
      map.set(type, canonical);
    }
  }
  return map;
}

function normalizeFeature(
  feature: LeafletFacetFeature,
  lensMap: Map<string, string>,
): LeafletFacetFeature {
  const type = feature.$type;
  if (!type) return feature;
  const canonicalType = lensMap.get(type);
  if (!canonicalType) return feature;
  if (canonicalType === featureKind(feature)) return feature;
  const hash = type.indexOf("#");
  const prefix = hash === -1 ? type : type.slice(0, hash + 1);
  return { ...feature, $type: `${prefix}${canonicalType}` };
}

/** Normalize facet feature `$type`s via declared lenses. */
export function normalizeMarkpubFacets(
  facets: Array<LeafletFacet>,
  lenses: Array<MarkpubLens>,
): Array<LeafletFacet> {
  const lensMap = buildLensMap(lenses);
  if (lensMap.size === 0) return facets;
  return facets.map((facet) => ({
    ...facet,
    features: facet.features.map((feature) =>
      normalizeFeature(feature, lensMap),
    ),
  }));
}

function slugifyId(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replaceAll(/[^\w\s-]/g, "")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function headerLevel(features: Array<LeafletFacetFeature>): number {
  for (const feature of features) {
    if (feature.$type !== MARKPUB_HEADER) continue;
    const level = (feature as { level?: number }).level;
    if (typeof level === "number") {
      return Math.min(6, Math.max(1, level));
    }
  }
  return 1;
}

function hasFeatureKind(
  features: Array<LeafletFacetFeature>,
  kind: string,
): boolean {
  return features.some((feature) => featureKind(feature) === kind);
}

function stripHeaderSyntax(text: string): string {
  return text.replace(/^#{1,6}\s+/, "").trimEnd();
}

function stripStrongSyntax(text: string): string {
  const trimmed = text.trim();
  const doubleStar = trimmed.match(/^\*\*(.+)\*\*$/s);
  if (doubleStar) return doubleStar[1] ?? trimmed;
  const doubleUnderscore = trimmed.match(/^__(.+)__$/s);
  if (doubleUnderscore) return doubleUnderscore[1] ?? trimmed;
  return trimmed;
}

function facetReplacement(
  text: string,
  features: Array<LeafletFacetFeature>,
): string | null {
  if (hasFeatureKind(features, "yaml-front-matter")) {
    return "";
  }

  if (hasFeatureKind(features, "horizontalRule")) {
    return "\n\n<hr />\n\n";
  }

  if (hasFeatureKind(features, "raw")) {
    return text;
  }

  if (hasFeatureKind(features, "header")) {
    const level = headerLevel(features);
    const inner = stripHeaderSyntax(text);
    const id = hasFeatureKind(features, "idify") ? slugifyId(inner) : "";
    const idAttr = id ? ` id="${id}"` : "";
    return `\n\n<h${level}${idAttr}>${inner}</h${level}>\n\n`;
  }

  if (hasFeatureKind(features, "strong")) {
    const inner = stripStrongSyntax(text);
    return `<strong>${inner}</strong>`;
  }

  return null;
}

function spliceUtf8(
  text: string,
  byteStart: number,
  byteEnd: number,
  replacement: string,
): string {
  const before = sliceUtf8(text, 0, byteStart);
  const after = sliceUtf8(text, byteEnd, utf8ByteLength(text));
  return `${before}${replacement}${after}`;
}

/**
 * Apply Markpub facets to markdown: faceted ranges become inline HTML (via
 * rehype-raw) or are removed (front matter). Unfaceted ranges pass through
 * for the markdown parser.
 */
export function applyMarkpubFacets(
  markdown: string,
  facets: Array<LeafletFacet>,
): string {
  if (!facets.length) return markdown;

  let result = markdown;
  const ordered = facets.toSorted(
    (a, b) => b.index.byteStart - a.index.byteStart,
  );

  for (const facet of ordered) {
    const { byteStart, byteEnd } = facet.index;
    if (byteEnd <= byteStart) continue;
    const slice = sliceUtf8(result, byteStart, byteEnd);
    const replacement = facetReplacement(slice, facet.features);
    if (replacement === null) continue;
    result = spliceUtf8(result, byteStart, byteEnd, replacement);
  }

  return result.replace(/^\s+/, "");
}

export {
  MARKPUB_HEADER,
  MARKPUB_HR,
  MARKPUB_IDIFY,
  MARKPUB_RAW,
  MARKPUB_STRONG,
  MARKPUB_YAML,
};
