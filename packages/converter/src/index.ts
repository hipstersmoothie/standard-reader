// Public entry point for @standard-reader/converter — translate a Standard Site
// document's content between the Leaflet, Offprint, pckt and Markpub formats,
// with a per-block account of everything the conversion costs.

export { convertDocumentContent } from "./convert.js";

export {
  CONVERSION_TARGETS,
  TARGET_CONTENT_TYPE,
  TARGET_LABEL,
  isConversionTarget,
  targetForContentType,
} from "./types.js";
export type {
  BlockType,
  ConversionIssue,
  ConversionResult,
  ConversionTarget,
  ConvertOptions,
  IssueSeverity,
} from "./types.js";

// The capability matrix, for docs, `--explain` output and pre-flight checks.
export {
  BLOCK_SUPPORT,
  FOOTNOTE_SUPPORT,
  blockSupport,
} from "./capabilities.js";
export type { BlockSupport } from "./capabilities.js";

// Facet dialect helpers, for callers translating rich text on their own.
export { canonicalFacetKind, facetKindsIn, remapRichText } from "./facets.js";
export type { FacetKind, RemapContext } from "./facets.js";

export { summarizeIssues } from "./summary.js";
export type { IssueSummary } from "./summary.js";
