import type { JsonValue } from "#/integrations/tanstack-query/api-shapes";

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
  codeHighlights?: Record<string, string>;
}

export type ContentRenderer = React.ComponentType<ContentRendererProps>;
