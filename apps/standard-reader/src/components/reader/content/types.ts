import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";
import type { CodeHighlightsByScheme } from "#/lib/theme";

export interface ContentBlobContext {
  /** DID of the repo that owns the document record (blob host). */
  authorDid: string;
}

export interface ContentRendererProps {
  content: JsonValue;
  hasHero: boolean;
  /** When true, omit the first image block (or leading markdown/HTML image). */
  skipFirstBlock?: boolean;
  /** The document's header description. When the body's first block is a heading
   * whose text exactly matches this, the renderer drops that heading (it would
   * duplicate the header). */
  leadDescription?: string | null;
  blobContext?: ContentBlobContext;
  codeHighlights?: CodeHighlightsByScheme;
}

export type ContentRenderer = React.ComponentType<ContentRendererProps>;
