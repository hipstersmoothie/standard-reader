import type { LeafletFacet } from "#/lib/leaflet/types";

import type { MarkpubDocument, MarkpubFlavor, MarkpubLens } from "./types";

import { MARKPUB_MARKDOWN, MARKPUB_TEXT } from "./types";

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
    (feature): feature is LeafletFacet["features"][number] =>
      isRecord(feature) && typeof feature.$type === "string",
  );
  if (features.length === 0) return null;
  return { index: { byteStart, byteEnd }, features };
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

function parseFlavor(value: unknown): MarkpubFlavor {
  return value === "commonmark" ? "commonmark" : "gfm";
}

function parseExtensions(value: unknown): Array<string> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseFrontMatter(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : [];
}

function textPayload(
  content: Record<string, unknown>,
): Record<string, unknown> | null {
  const text = content.text;
  if (isRecord(text)) return text;
  if (typeof text === "string") {
    return { $type: MARKPUB_TEXT, markdown: text };
  }
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
    markdown,
    flavor: meta.flavor,
    extensions: meta.extensions,
    frontMatter: meta.frontMatter,
    facets: parseFacets(text.facets),
    lenses: parseLenses(text.lenses),
  };
}

/** Parse a stored `at.markpub.markdown` (or nested `at.markpub.text`) payload. */
export function parseMarkpubContent(content: unknown): MarkpubDocument | null {
  if (!isRecord(content)) return null;

  if (content.$type === MARKPUB_MARKDOWN) {
    const text = textPayload(content);
    if (!text) return null;
    return documentFromText(text, {
      flavor: parseFlavor(content.flavor),
      extensions: parseExtensions(content.extensions),
      frontMatter: parseFrontMatter(content.frontMatter),
    });
  }

  if (content.$type === MARKPUB_TEXT) {
    return documentFromText(content, {
      flavor: "gfm",
      extensions: [],
      frontMatter: [],
    });
  }

  return null;
}

export function isMarkpubFormat(format: string | null | undefined): boolean {
  return format === MARKPUB_MARKDOWN;
}
