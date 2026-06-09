import {
  ALT_MARKDOWN_FORMATS,
  HTML_CONTENT_FORMATS,
  LEAFLET_DOCUMENT_FORMAT,
  STRUCTURED_BLOCK_FORMATS,
} from "#/lib/document/content-formats";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { OFFPRINT_CONTENT } from "#/lib/offprint/types";
import { PCKT_CONTENT } from "#/lib/pckt/types";

import type { ContentRenderer } from "../types";

import { AltMarkdownContentRenderer } from "./alt-markdown-content";
import { HtmlContentRenderer } from "./html-content";
import { LeafletContentRenderer } from "./leaflet-content";
import { LeafletDocumentContentRenderer } from "./leaflet-document-content";
import { MarkdownContentRenderer } from "./markdown-content";
import { OffprintContentRenderer } from "./offprint-content";
import { PcktContentRenderer } from "./pckt-content";
import { StructuredFormatContentRenderer } from "./structured-format-content";

/** Registry of `site.standard.document` content union renderers keyed by `$type`. */
export const CONTENT_RENDERERS: Record<string, ContentRenderer> = {
  [LEAFLET_CONTENT]: LeafletContentRenderer,
  [LEAFLET_DOCUMENT_FORMAT]: LeafletDocumentContentRenderer,
  [PCKT_CONTENT]: PcktContentRenderer,
  [OFFPRINT_CONTENT]: OffprintContentRenderer,
  [STANDARD_MARKDOWN_CONTENT]: MarkdownContentRenderer,
};

for (const format of ALT_MARKDOWN_FORMATS) {
  CONTENT_RENDERERS[format] = AltMarkdownContentRenderer;
}
for (const format of HTML_CONTENT_FORMATS) {
  CONTENT_RENDERERS[format] = HtmlContentRenderer;
}
for (const format of STRUCTURED_BLOCK_FORMATS) {
  CONTENT_RENDERERS[format] = StructuredFormatContentRenderer;
}
