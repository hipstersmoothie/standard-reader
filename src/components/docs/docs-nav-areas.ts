import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

export type DocsArea = "api" | "renderers" | "lexicons" | "publishing";

/**
 * The pages reachable from the shared docs sidebar. Each is a real route with
 * its own loader and scroll-spy nav; the sidebar switches between them.
 */
export const DOCS_AREAS: ReadonlyArray<{
  area: DocsArea;
  to: "/docs/api" | "/docs/renderers" | "/docs/lexicons" | "/docs/publishing";
  label: MessageDescriptor;
}> = [
  { area: "api", to: "/docs/api", label: msg`API` },
  { area: "renderers", to: "/docs/renderers", label: msg`Renderers` },
  { area: "lexicons", to: "/docs/lexicons", label: msg`Lexicons` },
  { area: "publishing", to: "/docs/publishing", label: msg`Publishing` },
] as const;
