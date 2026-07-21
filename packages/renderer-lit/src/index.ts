// Public entry point for @standard-reader/renderer-lit.

export {
  renderDocument,
  renderBlocks,
  type RenderDocumentOptions,
} from "./render";
export { defaultComponents } from "./defaults";
export { mergeComponents } from "./merge";
export {
  StandardDocumentElement,
  STANDARD_DOCUMENT_TAG,
  registerStandardDocument,
} from "./element";

export type {
  Renderable,
  RenderContext,
  LitComponents,
  LitComponentsInput,
  LitSharedComponents,
  LitInlineComponents,
  LitLeafletComponents,
  LitPcktComponents,
  LitOffprintComponents,
  LitTableCell,
  LitTableRow,
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
