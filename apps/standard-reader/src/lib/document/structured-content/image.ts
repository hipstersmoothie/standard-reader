/**
 * Image helpers for the structured formats — re-exported from
 * `@standard-reader/renderer-core`, which owns them (see `./types`).
 *
 * Kept as an import path because the leaflet, pckt and markdown renderers all
 * reach for `normalizeImageAlt` from here.
 */

export {
  narrationImageLines,
  normalizeImageAlt,
  parseStructuredGridImage,
  structuredImageAspectRatio,
  structuredImageHasSource,
  structuredImageUrl,
} from "@standard-reader/renderer-core";
