import { Injectable } from "@angular/core";
import { segmentInline } from "@standard-reader/renderer-core";
import type { InlineNode, RichText } from "@standard-reader/renderer-core";

import type { AngularComponents } from "./types";

/**
 * Per-document render context, provided by `StandardDocumentComponent` and
 * injected by the recursive block/inline components. Holds the override
 * templates and the footnote numbering, and turns rich text into inline nodes.
 */
@Injectable()
export class RenderContextService {
  components: AngularComponents = {};
  footnoteNumbers: ReadonlyMap<string, number> = new Map();

  inline(text: RichText): Array<InlineNode> {
    return segmentInline(text, this.footnoteNumbers);
  }
}
