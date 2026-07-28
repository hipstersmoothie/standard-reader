/**
 * The structured block vocabulary — re-exported from
 * `@standard-reader/renderer-core`, which owns it.
 *
 * The app used to keep its own copy of these types (and of every parser that
 * produces them). The two drifted: core grew nested list items, image captions,
 * raw-HTML blocks and callout metadata that the app's copy never got, so a
 * format parsed by core couldn't be handed to an app consumer at all. There is
 * one definition now; this module stays as the import path the app already
 * uses.
 */

export type {
  StandardMarkdownContent,
  StructuredGridImage,
  StructuredItemsContent,
  StructuredListItem,
  StructuredRenderableBlock,
  StructuredTableCell,
  StructuredTableRow,
  StructuredText,
} from "@standard-reader/renderer-core";
export { STANDARD_MARKDOWN_CONTENT } from "@standard-reader/renderer-core";
