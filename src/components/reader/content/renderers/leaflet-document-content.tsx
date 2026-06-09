"use client";

import { leafletDocumentContent } from "#/lib/document/content-formats";

import type { ContentRendererProps } from "../types";

import { LeafletContentRenderer } from "./leaflet-content";

/**
 * Renders `pub.leaflet.document` — a full Leaflet document record whose
 * `pages` match `pub.leaflet.content`, adapted onto the leaflet renderer.
 */
export function LeafletDocumentContentRenderer(props: ContentRendererProps) {
  const adapted = leafletDocumentContent(props.content);
  if (!adapted) return null;
  return (
    <LeafletContentRenderer
      {...props}
      content={adapted as ContentRendererProps["content"]}
    />
  );
}
