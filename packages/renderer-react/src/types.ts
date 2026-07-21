import type { ReactNode } from "react";

// Document input, options, and image resolution are owned by the
// framework-agnostic core and re-exported here for convenience.
export type {
  StandardSiteDocument,
  RendererOptions,
  ImageUrlResolver,
  AspectRatio,
} from "@standard-reader/renderer-core";

/** A single cell in a rendered table (children are already-rendered content). */
export interface TableCell {
  header: boolean;
  children: ReactNode;
}

/** A rendered table row. */
export type TableRow = Array<TableCell>;
