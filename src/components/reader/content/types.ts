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
  blobContext?: ContentBlobContext;
  codeHighlights?: CodeHighlightsByScheme;
}

export type ContentRenderer = React.ComponentType<ContentRendererProps>;
