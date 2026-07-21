// Public entry point for @standard-reader/renderer-solid.

export {
  renderDocument,
  renderBlocks,
  type RenderDocumentOptions,
} from "./render";
export { defaultComponents } from "./defaults";
export { mergeComponents } from "./merge";
export { StandardDocument, type StandardDocumentProps } from "./element";

export type {
  Renderable,
  RenderContext,
  SolidComponents,
  SolidComponentsInput,
  SolidSharedComponents,
  SolidInlineComponents,
  SolidLeafletComponents,
  SolidPcktComponents,
  SolidOffprintComponents,
  SolidTableCell,
  SolidTableRow,
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
