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
