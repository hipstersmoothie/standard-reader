// Public entry point for @standard-reader/renderer-vue.

export {
  renderDocument,
  renderBlocks,
  type RenderDocumentOptions,
} from "./render";
export { defaultComponents } from "./defaults";
export { mergeComponents } from "./merge";
export { StandardDocument } from "./element";

export type {
  Renderable,
  RenderContext,
  VueComponents,
  VueComponentsInput,
  VueSharedComponents,
  VueInlineComponents,
  VueLeafletComponents,
  VuePcktComponents,
  VueOffprintComponents,
  VueTableCell,
  VueTableRow,
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
