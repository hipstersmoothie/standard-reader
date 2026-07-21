// Public entry point for @standard-reader/renderer-svelte.

export { default as StandardDocument } from "./StandardDocument.svelte";

export type {
  SvelteComponents,
  SvelteSharedComponents,
  SvelteInlineComponents,
  SvelteLeafletComponents,
  SveltePcktComponents,
  SvelteOffprintComponents,
  RichCell,
} from "./types";

// Re-export the framework-agnostic document input + options + tree types.
export {
  buildRenderTree,
  segmentInline,
  defaultImageUrlResolver,
} from "@standard-reader/renderer-core";
export type {
  StandardSiteDocument,
  RendererOptions,
  ImageUrlResolver,
  DocumentTree,
  BlockNode,
  InlineNode,
  RichText,
} from "@standard-reader/renderer-core";
