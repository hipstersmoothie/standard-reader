import type {
  RendererOptions,
  StandardSiteDocument,
} from "@standard-reader/renderer-core";

import { renderDocument } from "./render";
import type { Renderable, SolidComponentsInput } from "./types";

export interface StandardDocumentProps {
  document: StandardSiteDocument;
  options?: RendererOptions;
  components?: SolidComponentsInput;
}

/**
 * `<StandardDocument>` — a Solid component that renders a Standard Site document.
 *
 * ```tsx
 * <StandardDocument document={doc} options={{ dropCap: true }} />
 * ```
 */
export function StandardDocument(props: StandardDocumentProps): Renderable {
  return renderDocument(props.document, {
    components: props.components,
    options: props.options,
  });
}
