"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, use, useMemo } from "react";

import { fetchOffprintComponent } from "#/lib/offprint/component";

import type { ContentBlobContext } from "../types";
// Recursive block renderer: a component's body is arbitrary Offprint content,
// so it renders through the same switch that dispatched to it. The resulting
// import cycle is safe — `StructuredBlockView` is a hoisted function
// declaration and is only referenced at render time, never at module eval.
import { StructuredBlockView } from "./structured-block-view";

/**
 * AT-URIs of the components currently being rendered, outermost first.
 *
 * Components are referenced by URI, so a publication can (accidentally) author
 * one that embeds itself, or a pair that embed each other. Rendering those
 * would recurse until the browser dies, so each level refuses to expand a URI
 * already on the stack.
 */
const OffprintComponentStack = createContext<ReadonlyArray<string>>([]);

/** Hard ceiling on nesting, independent of the cycle check — a deep but acyclic
 * chain is still far more than any real newsletter footer needs. */
const MAX_COMPONENT_DEPTH = 3;

/**
 * Renders `app.offprint.block.component` — a reusable snippet (newsletter
 * footer, content warning) stored as its own `app.offprint.component` record
 * and inlined by AT-URI.
 *
 * Fetched client-side rather than resolved at ingest because Offprint
 * references components by URI specifically so edits cascade to every document
 * embedding them; pinning the body into `content_json` would freeze that.
 * Renders nothing until it resolves, and nothing if it can't — the snippet is
 * supplementary, so a failed fetch should leave the article intact rather than
 * show an error.
 */
export function OffprintComponentBlockView({
  componentUri,
}: {
  componentUri: string;
}) {
  const stack = use(OffprintComponentStack);
  const isCycle = stack.includes(componentUri);
  const atDepthLimit = stack.length >= MAX_COMPONENT_DEPTH;
  const enabled = Boolean(componentUri) && !isCycle && !atDepthLimit;

  const { data: component } = useQuery({
    queryKey: ["offprint-component", componentUri] as const,
    queryFn: () => fetchOffprintComponent(componentUri),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const nestedStack = useMemo(
    () => [...stack, componentUri],
    [stack, componentUri],
  );

  if (!enabled || !component) return null;

  // Blobs inside the component live in the component's repo, which is not
  // necessarily the document author's (a publication may embed a shared one).
  const componentBlobContext: ContentBlobContext = { authorDid: component.did };

  return (
    <OffprintComponentStack.Provider value={nestedStack}>
      {component.blocks.map((block, index) => (
        <StructuredBlockView
          key={index}
          block={block}
          blobContext={componentBlobContext}
        />
      ))}
    </OffprintComponentStack.Provider>
  );
}
