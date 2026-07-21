import type {
  RendererOptions,
  StandardSiteDocument,
} from "@standard-reader/renderer-core";
import { LitElement, nothing } from "lit";

import { renderDocument } from "./render";
import type { LitComponentsInput } from "./types";

/**
 * `<standard-document>` — a custom element that renders a Standard Site document
 * with the Lit renderer. Set the `document` property (and optionally `options`
 * and `components`); the element renders into light DOM so page styles apply.
 *
 * ```ts
 * const el = document.createElement("standard-document");
 * el.document = { content, authorDid };
 * el.components = { shared: { image: (p) => html`<my-image .src=${p.src}></my-image>` } };
 * host.append(el);
 * ```
 */
export class StandardDocumentElement extends LitElement {
  static properties = {
    document: { attribute: false },
    options: { attribute: false },
    components: { attribute: false },
  };

  document?: StandardSiteDocument;
  options?: RendererOptions;
  components?: LitComponentsInput;

  // Render into light DOM (no shadow root) so the host page's CSS applies to the
  // unstyled output — the whole point of a headless renderer.
  protected override createRenderRoot(): HTMLElement | DocumentFragment {
    return this;
  }

  override render(): unknown {
    if (!this.document) return nothing;
    return renderDocument(this.document, {
      components: this.components,
      options: this.options,
    });
  }
}

export const STANDARD_DOCUMENT_TAG = "standard-document";

/** Register `<standard-document>` (idempotent, and a no-op without a DOM). */
export function registerStandardDocument(
  tag: string = STANDARD_DOCUMENT_TAG,
): void {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(tag)) {
    customElements.define(tag, StandardDocumentElement);
  }
}

registerStandardDocument();

declare global {
  interface HTMLElementTagNameMap {
    "standard-document": StandardDocumentElement;
  }
}
