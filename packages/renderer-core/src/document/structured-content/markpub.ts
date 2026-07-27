/**
 * Markpub (`at.markpub.markdown`) — the markdown content format used by
 * Mochott and anything else built on the Markpub lexicon.
 *
 * Unlike the plain markdown-in-record formats (see `markdown.ts`), a Markpub
 * payload is markdown *plus* out-of-band metadata:
 *
 *   · `flavor` — `gfm` (default) or `commonmark`.
 *   · `extensions` — declared syntax extensions (`yaml`, `latex`, …).
 *   · `frontMatter` — when present (or the `yaml` extension is declared), a
 *     leading YAML block is metadata, not body.
 *   · `text.facets` — byte-indexed facets over the *markdown source*. Most are
 *     redundant with the syntax already in the source, but some formats
 *     (headers, strong, horizontal rules, front matter) are expressed *only*
 *     as facets, with the source left unmarked.
 *   · `text.lenses` — alias groups that map a publisher's own facet `$type`s
 *     onto the canonical ones.
 *
 * So rendering is: normalize facet `$type`s through the lenses, rewrite the
 * facet-only constructs back into markdown syntax, strip front matter, then
 * hand the result to the shared markdown parser. Everything lands in the same
 * {@link StructuredRenderableBlock} vocabulary as every other format — no
 * Markpub-specific node types and no per-renderer code.
 *
 * Two knowingly-dropped details: `#idify` heading anchors (the block
 * vocabulary has no heading id) and the `latex` extension (core's markdown
 * parser has no math extension, so `$$…$$` stays literal text).
 */

import { isRecord } from "../../internal.js";
import type { LeafletFacet, LeafletFacetFeature } from "../../leaflet/types.js";
import { sliceUtf8, utf8ByteLength } from "../../leaflet/utf8.js";
import type { MarkdownFlavor } from "./markdown.js";
import { markdownBlocksFromText } from "./markdown.js";
import type { StructuredRenderableBlock } from "./types.js";

export const MARKPUB_MARKDOWN = "at.markpub.markdown";
export const MARKPUB_TEXT = "at.markpub.text";

/** Content `$type`s handled by this module. */
export const MARKPUB_FORMATS = [MARKPUB_MARKDOWN, MARKPUB_TEXT];

export function isMarkpubFormat(format: string | null | undefined): boolean {
  return format === MARKPUB_MARKDOWN || format === MARKPUB_TEXT;
}

/** A lens: a group of facet `$type`s that all mean the same thing. */
export interface MarkpubLens {
  facets: Array<{ $type?: string }>;
}

export interface MarkpubDocument {
  markdown: string;
  flavor: MarkdownFlavor;
  extensions: Array<string>;
  frontMatter: Array<unknown>;
  facets: Array<LeafletFacet>;
  lenses: Array<MarkpubLens>;
}

// ---------------------------------------------------------------------------
// Parsing the record payload
// ---------------------------------------------------------------------------

function parseFacet(value: unknown): LeafletFacet | null {
  if (!isRecord(value) || !isRecord(value.index)) return null;
  const byteStart = value.index.byteStart;
  const byteEnd = value.index.byteEnd;
  if (typeof byteStart !== "number" || typeof byteEnd !== "number") return null;
  if (!Array.isArray(value.features)) return null;
  const features = value.features.filter(
    (feature): feature is LeafletFacetFeature =>
      isRecord(feature) && typeof feature.$type === "string",
  );
  if (features.length === 0) return null;
  return { features, index: { byteEnd, byteStart } };
}

function parseFacets(value: unknown): Array<LeafletFacet> {
  if (!Array.isArray(value)) return [];
  return value
    .map((facet) => parseFacet(facet))
    .filter((facet): facet is LeafletFacet => facet != null)
    .toSorted((a, b) => a.index.byteStart - b.index.byteStart);
}

function parseLenses(value: unknown): Array<MarkpubLens> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.facets)) return [];
    const facets = entry.facets.filter(
      (facet): facet is { $type?: string } =>
        isRecord(facet) && typeof facet.$type === "string",
    );
    return facets.length > 0 ? [{ facets }] : [];
  });
}

function parseFlavor(value: unknown): MarkdownFlavor {
  return value === "commonmark" ? "commonmark" : "gfm";
}

function parseExtensions(value: unknown): Array<string> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/** `text` is normally an `at.markpub.text` record; tolerate a bare string. */
function textPayload(
  content: Record<string, unknown>,
): Record<string, unknown> | null {
  const text = content.text;
  if (isRecord(text)) return text;
  if (typeof text === "string") return { $type: MARKPUB_TEXT, markdown: text };
  return null;
}

function documentFromText(
  text: Record<string, unknown>,
  meta: Pick<MarkpubDocument, "flavor" | "extensions" | "frontMatter">,
): MarkpubDocument | null {
  const markdown =
    typeof text.markdown === "string" ? text.markdown.trim() : "";
  if (!markdown) return null;
  return {
    extensions: meta.extensions,
    facets: parseFacets(text.facets),
    flavor: meta.flavor,
    frontMatter: meta.frontMatter,
    lenses: parseLenses(text.lenses),
    markdown,
  };
}

/** Parse an `at.markpub.markdown` (or bare `at.markpub.text`) payload. */
export function parseMarkpubContent(content: unknown): MarkpubDocument | null {
  if (!isRecord(content)) return null;

  if (content.$type === MARKPUB_MARKDOWN) {
    const text = textPayload(content);
    if (!text) return null;
    return documentFromText(text, {
      extensions: parseExtensions(content.extensions),
      flavor: parseFlavor(content.flavor),
      frontMatter: Array.isArray(content.frontMatter)
        ? content.frontMatter
        : [],
    });
  }

  if (content.$type === MARKPUB_TEXT) {
    return documentFromText(content, {
      extensions: [],
      flavor: "gfm",
      frontMatter: [],
    });
  }

  return null;
}

// ---------------------------------------------------------------------------
// Facets → markdown syntax
// ---------------------------------------------------------------------------

/** Canonical facet kinds this module understands after lens normalization. */
const KNOWN_FACET_ALIASES: Record<string, string> = {
  bold: "strong",
  code: "code",
  didMention: "mention",
  header: "header",
  highlight: "highlight",
  horizontalRule: "horizontalRule",
  idify: "idify",
  italic: "italic",
  link: "link",
  mention: "mention",
  raw: "raw",
  strikethrough: "strikethrough",
  strong: "strong",
  underline: "underline",
  "yaml-front-matter": "yaml-front-matter",
};

function facetFeatureSuffix($type: string | undefined): string | null {
  if (!$type) return null;
  const hash = $type.indexOf("#");
  return hash === -1 ? null : $type.slice(hash + 1);
}

function featureKind(feature: LeafletFacetFeature): string | null {
  const kind = facetFeatureSuffix(feature.$type);
  return kind ? (KNOWN_FACET_ALIASES[kind] ?? kind) : null;
}

/** `$type` → canonical `$type`, from every lens that groups two or more. */
function buildLensMap(lenses: Array<MarkpubLens>): Map<string, string> {
  const map = new Map<string, string>();
  for (const lens of lenses) {
    const types = lens.facets
      .map((facet) => facet.$type)
      .filter((type): type is string => typeof type === "string");
    if (types.length < 2) continue;
    const first = types[0];
    if (first === undefined) continue;
    const canonical = featureKind({ $type: first }) ?? first;
    for (const type of types) map.set(type, canonical);
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

/** Rewrite facet feature `$type`s onto their canonical form via the lenses. */
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

function hasFeatureKind(
  features: Array<LeafletFacetFeature>,
  kind: string,
): boolean {
  return features.some((feature) => featureKind(feature) === kind);
}

function headerLevel(features: Array<LeafletFacetFeature>): number {
  for (const feature of features) {
    const level = (feature as { level?: number }).level;
    if (featureKind(feature) === "header" && typeof level === "number") {
      return Math.min(6, Math.max(1, level));
    }
  }
  return 1;
}

function stripHeaderSyntax(text: string): string {
  return text.replace(/^#{1,6}\s+/, "").trimEnd();
}

function stripStrongSyntax(text: string): string {
  const trimmed = text.trim();
  const doubleStar = /^\*\*([\S\s]+)\*\*$/.exec(trimmed);
  if (doubleStar?.[1]) return doubleStar[1];
  const doubleUnderscore = /^__([\S\s]+)__$/.exec(trimmed);
  if (doubleUnderscore?.[1]) return doubleUnderscore[1];
  return trimmed;
}

/**
 * The markdown a faceted range should become, or null to leave it as-is.
 *
 * The app renderer rewrites these to inline HTML and leans on `rehype-raw`;
 * here they become markdown syntax instead, so the constructs survive core's
 * markdown parser (which drops raw HTML nodes) and arrive as real heading /
 * strong / horizontal-rule blocks.
 */
function facetReplacement(
  text: string,
  features: Array<LeafletFacetFeature>,
): string | null {
  if (hasFeatureKind(features, "yaml-front-matter")) return "";
  if (hasFeatureKind(features, "horizontalRule")) return "\n\n---\n\n";
  if (hasFeatureKind(features, "raw")) return text;
  if (hasFeatureKind(features, "header")) {
    const hashes = "#".repeat(headerLevel(features));
    return `\n\n${hashes} ${stripHeaderSyntax(text)}\n\n`;
  }
  if (hasFeatureKind(features, "strong")) {
    return `**${stripStrongSyntax(text)}**`;
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
 * Apply Markpub facets to the markdown source. Applied back-to-front so each
 * splice leaves earlier byte offsets valid.
 */
export function applyMarkpubFacets(
  markdown: string,
  facets: Array<LeafletFacet>,
): string {
  if (facets.length === 0) return markdown;

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

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

const YAML_FRONT_MATTER = /^---\r?\n[\S\s]*?\r?\n---\r?\n?/;

function hasExtension(extensions: Array<string>, ...names: Array<string>) {
  return extensions.some((entry) => names.includes(entry.toLowerCase()));
}

export interface PreparedMarkpubMarkdown {
  body: string;
  flavor: MarkdownFlavor;
}

/**
 * Normalize an `at.markpub.markdown` payload into plain renderable markdown:
 * strip front matter, apply facet transforms, honor the declared flavor.
 */
export function prepareMarkpubMarkdown(
  content: unknown,
): PreparedMarkpubMarkdown | null {
  const doc = parseMarkpubContent(content);
  if (!doc) return null;

  let body = doc.markdown;
  if (
    doc.frontMatter.length > 0 ||
    hasExtension(doc.extensions, "yaml", "yml")
  ) {
    body = body.replace(YAML_FRONT_MATTER, "").trimStart();
  }

  body = applyMarkpubFacets(
    body,
    normalizeMarkpubFacets(doc.facets, doc.lenses),
  ).trim();
  if (!body) return null;

  return { body, flavor: doc.flavor };
}

/**
 * Renderable blocks for an `at.markpub.markdown` payload, or null when the
 * format doesn't match or the body is empty. Registered for every
 * {@link MARKPUB_FORMATS} entry so `buildRenderTree` handles Markpub like any
 * other structured format.
 */
export function markpubBlocks(
  content: unknown,
  contentFormat?: string | null,
): Array<StructuredRenderableBlock> | null {
  const format =
    isRecord(content) && typeof content.$type === "string"
      ? content.$type
      : contentFormat;
  if (!isMarkpubFormat(format)) return null;
  // Records that carry the format only in `contentFormat` still need a `$type`
  // for the payload parser to dispatch on.
  const payload =
    isRecord(content) && typeof content.$type !== "string"
      ? { ...content, $type: format }
      : content;
  const prepared = prepareMarkpubMarkdown(payload);
  if (!prepared) return null;
  return markdownBlocksFromText(prepared.body, prepared.flavor);
}
