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
