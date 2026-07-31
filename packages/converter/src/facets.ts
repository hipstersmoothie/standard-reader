/**
 * Translating inline rich text between facet dialects.
 *
 * Every format stores inline formatting the same way — byte-indexed ranges over
 * the block's plaintext, each carrying feature objects identified by `$type` —
 * and differs only in the namespace and in which features it defines. So a
 * conversion is a `$type` rewrite: the byte offsets and the plaintext are
 * untouched, features the target has no name for are dropped, and each drop is
 * reported.
 */

import type { RichText } from "@standard-reader/renderer-core";
import { facetFeatureKind } from "@standard-reader/renderer-core";

import { isRecord } from "./internal.js";
import type { ConversionTarget, Reporter } from "./types.js";

/** Facet namespaces, per target. Markpub is markdown, so it has none. */
const FACET_NAMESPACE: Record<ConversionTarget, string | null> = {
  leaflet: "pub.leaflet.richtext.facet",
  markpub: null,
  offprint: "app.offprint.richtext.facet",
  pckt: "blog.pckt.richtext.facet",
};

/** The inline features this converter knows how to name in every dialect. */
export type FacetKind =
  | "bold"
  | "italic"
  | "code"
  | "underline"
  | "strikethrough"
  | "highlight"
  | "link"
  | "atMention"
  | "didMention"
  | "footnote";

/** Which features each target's facet dialect actually defines. */
const SUPPORTED_KINDS: Record<ConversionTarget, ReadonlySet<FacetKind>> = {
  leaflet: new Set([
    "bold",
    "italic",
    "code",
    "link",
    "atMention",
    "didMention",
    "footnote",
  ]),
  // Markdown syntax, not facets — see `markdown.ts`.
  markpub: new Set(["bold", "italic", "code", "link", "strikethrough"]),
  // Conservative: only the features seen on published Offprint records. Adding
  // a `$type` Offprint does not define would produce a record it cannot read.
  offprint: new Set(["bold", "italic", "code", "link"]),
  pckt: new Set([
    "bold",
    "italic",
    "code",
    "underline",
    "strikethrough",
    "highlight",
    "link",
    "atMention",
    "didMention",
  ]),
};

/** Prose names, for warning messages. */
const KIND_LABEL: Record<FacetKind, string> = {
  atMention: "record mention",
  bold: "bold",
  code: "inline code",
  didMention: "account mention",
  footnote: "footnote",
  highlight: "highlight",
  italic: "italic",
  link: "link",
  strikethrough: "strikethrough",
  underline: "underline",
};

interface FacetFeature {
  $type?: string;
  uri?: string;
  did?: string;
  atURI?: string;
  footnoteId?: string;
  contentPlaintext?: string;
  contentFacets?: Array<unknown>;
  [key: string]: unknown;
}

interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: Array<FacetFeature>;
}

/** Narrow an unknown facet entry to one with a usable byte range + features. */
function asFacet(value: unknown): Facet | null {
  if (!isRecord(value) || !isRecord(value.index)) return null;
  const { byteStart, byteEnd } = value.index;
  if (typeof byteStart !== "number" || typeof byteEnd !== "number") return null;
  if (!Array.isArray(value.features)) return null;
  const features = value.features.filter((feature): feature is FacetFeature =>
    isRecord(feature),
  );
  if (features.length === 0) return null;
  return { features, index: { byteEnd, byteStart } };
}

/**
 * The canonical kind a feature means, across every dialect's spelling.
 *
 * `strong` is Leaflet-adjacent shorthand for `bold`; Offprint's `webMention` is
 * a link enriched with page metadata; a bare `mention` is a DID or record
 * mention depending on which target field it carries.
 */
export function canonicalFacetKind(feature: FacetFeature): FacetKind | null {
  const suffix = facetFeatureKind(feature.$type);
  switch (suffix) {
    case "bold":
    case "strong": {
      return "bold";
    }
    case "em":
    case "italic": {
      return "italic";
    }
    case "code": {
      return "code";
    }
    case "underline": {
      return "underline";
    }
    case "strike":
    case "strikethrough": {
      return "strikethrough";
    }
    case "highlight":
    case "mark": {
      return "highlight";
    }
    case "link":
    case "webMention": {
      return "link";
    }
    case "atMention": {
      return "atMention";
    }
    case "didMention": {
      return "didMention";
    }
    case "mention": {
      if (typeof feature.did === "string") return "didMention";
      if (typeof feature.atURI === "string") return "atMention";
      return null;
    }
    case "footnote": {
      return "footnote";
    }
    default: {
      return null;
    }
  }
}

/** Whether a feature carries the target it needs to stay meaningful. */
function featureHasTarget(kind: FacetKind, feature: FacetFeature): boolean {
  switch (kind) {
    case "link": {
      return typeof feature.uri === "string" && feature.uri.length > 0;
    }
    case "atMention": {
      return typeof feature.atURI === "string" && feature.atURI.length > 0;
    }
    case "didMention": {
      return typeof feature.did === "string" && feature.did.length > 0;
    }
    case "footnote": {
      return (
        typeof feature.footnoteId === "string" && feature.footnoteId.length > 0
      );
    }
    default: {
      return true;
    }
  }
}

/** Rewrite one feature into the target's dialect, keeping only its own fields. */
function emitFeature(
  kind: FacetKind,
  feature: FacetFeature,
  namespace: string,
  target: ConversionTarget,
): Record<string, unknown> {
  const $type = `${namespace}#${kind}`;
  switch (kind) {
    case "link": {
      return { $type, uri: feature.uri };
    }
    case "atMention": {
      return { $type, atURI: feature.atURI };
    }
    case "didMention": {
      return { $type, did: feature.did };
    }
    case "footnote": {
      const nested = remapFacetArray(feature.contentFacets, target);
      return {
        $type,
        footnoteId: feature.footnoteId,
        ...(feature.contentPlaintext === undefined
          ? {}
          : { contentPlaintext: feature.contentPlaintext }),
        ...(nested.length > 0 ? { contentFacets: nested } : {}),
      };
    }
    default: {
      return { $type };
    }
  }
}

/** Remap a facet array with no reporting — used for nested footnote facets. */
function remapFacetArray(
  facets: Array<unknown> | undefined,
  target: ConversionTarget,
): Array<Record<string, unknown>> {
  const namespace = FACET_NAMESPACE[target];
  if (!namespace || !facets?.length) return [];
  const supported = SUPPORTED_KINDS[target];
  const out: Array<Record<string, unknown>> = [];
  for (const entry of facets) {
    const facet = asFacet(entry);
    if (!facet) continue;
    const features = facet.features.flatMap((feature) => {
      const kind = canonicalFacetKind(feature);
      if (!kind || !supported.has(kind) || !featureHasTarget(kind, feature)) {
        return [];
      }
      return [emitFeature(kind, feature, namespace, target)];
    });
    if (features.length > 0) out.push({ features, index: facet.index });
  }
  return out;
}

export interface RemapContext {
  target: ConversionTarget;
  report: Reporter["report"];
  blockIndex: number | null;
  blockType: string;
}

/**
 * Rewrite a run of rich text into the target's facet dialect.
 *
 * Byte offsets and plaintext pass through untouched — only feature `$type`s
 * change — so the result is exactly as faithful as the target's vocabulary
 * allows. Features the target has no name for are dropped and reported once per
 * kind per block, so a paragraph with twelve highlights warns once.
 */
export function remapRichText(
  text: RichText,
  ctx: RemapContext,
): { plaintext: string; facets?: Array<Record<string, unknown>> } {
  const namespace = FACET_NAMESPACE[ctx.target];
  if (!namespace) {
    throw new Error(
      `${ctx.target} does not use facets; convert its inline text to markdown instead`,
    );
  }

  const supported = SUPPORTED_KINDS[ctx.target];
  const dropped = new Set<FacetKind>();
  const out: Array<Record<string, unknown>> = [];

  for (const entry of text.facets ?? []) {
    const facet = asFacet(entry);
    if (!facet) continue;

    const features: Array<Record<string, unknown>> = [];
    for (const feature of facet.features) {
      const kind = canonicalFacetKind(feature);
      // An unrecognized feature is a publisher extension we cannot name in the
      // target dialect; it never carried text of its own, so it just goes.
      if (!kind) continue;
      if (!supported.has(kind)) {
        dropped.add(kind);
        continue;
      }
      if (!featureHasTarget(kind, feature)) continue;
      features.push(emitFeature(kind, feature, namespace, ctx.target));
    }

    if (features.length > 0) out.push({ features, index: facet.index });
  }

  for (const kind of dropped) {
    ctx.report({
      blockIndex: ctx.blockIndex,
      blockType: ctx.blockType,
      code: "facet-dropped",
      message: `${KIND_LABEL[kind]} formatting has no equivalent in the ${ctx.target} facet vocabulary`,
      severity: "lossy",
      fallback: "the text is kept, unstyled",
    });
  }

  return out.length > 0
    ? { facets: out, plaintext: text.plaintext }
    : { plaintext: text.plaintext };
}

/** The facet kinds present in a run, for pre-flight capability checks. */
export function facetKindsIn(text: RichText): Set<FacetKind> {
  const kinds = new Set<FacetKind>();
  for (const entry of text.facets ?? []) {
    const facet = asFacet(entry);
    if (!facet) continue;
    for (const feature of facet.features) {
      const kind = canonicalFacetKind(feature);
      if (kind) kinds.add(kind);
    }
  }
  return kinds;
}
