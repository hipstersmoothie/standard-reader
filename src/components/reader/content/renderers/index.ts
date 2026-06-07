import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { OFFPRINT_CONTENT } from "#/lib/offprint/types";
import { PCKT_CONTENT } from "#/lib/pckt/types";

import type { ContentRenderer } from "../types";

import { LeafletContentRenderer } from "./leaflet-content";
import { MarkdownContentRenderer } from "./markdown-content";
import { OffprintContentRenderer } from "./offprint-content";
import { PcktContentRenderer } from "./pckt-content";

/** Registry of `site.standard.document` content union renderers keyed by `$type`. */
export const CONTENT_RENDERERS: Record<string, ContentRenderer> = {
  [LEAFLET_CONTENT]: LeafletContentRenderer,
  [PCKT_CONTENT]: PcktContentRenderer,
  [OFFPRINT_CONTENT]: OffprintContentRenderer,
  [STANDARD_MARKDOWN_CONTENT]: MarkdownContentRenderer,
};
