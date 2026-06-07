import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";
import type { CodeHighlightsByScheme } from "#/lib/theme";

export interface ContentBlobContext {
  /** DID of the repo that owns the document record (blob host). */
  authorDid: string;
  /** Resolved PDS endpoint for `com.atproto.sync.getBlob` URLs. */
  authorPds: string | null;
}

export interface ContentRendererProps {
  content: JsonValue;
  hasHero: boolean;
  blobContext?: ContentBlobContext;
  codeHighlights?: CodeHighlightsByScheme;
}

export type ContentRenderer = React.ComponentType<ContentRendererProps>;
