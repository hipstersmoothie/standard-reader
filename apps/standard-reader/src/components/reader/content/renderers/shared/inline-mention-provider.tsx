"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import {
  collectInlineMentionRefs,
  EMPTY_INLINE_MENTIONS,
  hasInlineMentionRefs,
} from "#/lib/leaflet/publication-mentions";

import { InlineMentionContextProvider } from "./publication-mention-context";

/**
 * Resolves inline publication/actor references for a Leaflet document lazily —
 * after the article body paints, off the SSR critical path — then provides them
 * to the facet renderer so bare links/mentions upgrade to avatar chips. While
 * the query is in flight (or when nothing resolves) the renderer falls back to
 * plain links + `@handle`, so there is no blank state and no layout jump beyond
 * the avatar appearing.
 */
export function InlineMentionProvider({
  content,
  children,
}: {
  content: unknown;
  children: React.ReactNode;
}) {
  const refs = useMemo(() => collectInlineMentionRefs(content), [content]);
  const enabled = hasInlineMentionRefs(refs);

  const { data } = useQuery({
    ...publicationApi.getInlineMentionsQueryOptions(refs),
    enabled,
  });

  return (
    <InlineMentionContextProvider value={data ?? EMPTY_INLINE_MENTIONS}>
      {children}
    </InlineMentionContextProvider>
  );
}
