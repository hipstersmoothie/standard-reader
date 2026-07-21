// Public entry point for @standard-reader/renderer-angular.

export { StandardDocumentComponent } from "./standard-document.component";
export { BlockComponent } from "./block.component";
export { BlocksComponent } from "./blocks.component";
export { InlineComponent } from "./inline.component";
export { RenderContextService } from "./render-context.service";

export type {
  AngularComponents,
  AngularSharedComponents,
  AngularLeafletComponents,
  AngularPcktComponents,
  AngularOffprintComponents,
  Tpl,
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
