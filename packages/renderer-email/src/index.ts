// Public entry point for @standard-reader/renderer-email.

export { emailComponents } from "./components";
export {
  DocumentEmailBody,
  type DocumentEmailBodyProps,
  toStandardSiteDocument,
} from "./document";

// Re-export the document input / options types for convenience.
export type {
  RendererOptions,
  StandardSiteDocument,
} from "@standard-reader/renderer-core";
