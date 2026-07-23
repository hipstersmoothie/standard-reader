import type {
  RendererOptions,
  StandardSiteDocument,
} from "@standard-reader/renderer-core";
import { StandardDocumentRenderer } from "@standard-reader/renderer-react";

import { emailComponents } from "./components";

export interface DocumentEmailBodyProps {
  /** The Standard Site document to render (see `toStandardSiteDocument`). */
  document: StandardSiteDocument;
  /** Rendering options (image URL resolver, leading-image handling, …). */
  options?: RendererOptions;
}

/**
 * Render a Standard Site document's body as React Email components. Drop it
 * inside a React Email template (Container/Section) and render with
 * @react-email/render.
 */
export function DocumentEmailBody({ document, options }: DocumentEmailBodyProps) {
  return (
    <StandardDocumentRenderer
      document={document}
      components={emailComponents}
      options={options}
    />
  );
}

/** Build a StandardSiteDocument from a stored `documents` row's fields. */
export function toStandardSiteDocument(input: {
  contentJson: unknown;
  contentFormat?: string | null;
  authorDid?: string;
  description?: string | null;
}): StandardSiteDocument {
  return {
    content: input.contentJson,
    contentFormat: input.contentFormat ?? null,
    authorDid: input.authorDid,
    description: input.description ?? null,
  };
}
