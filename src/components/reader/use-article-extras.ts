"use client";

import { useQuery } from "@tanstack/react-query";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";

export function useArticleExtras(documentUri: string) {
  return useQuery(publicationApi.getArticleExtrasQueryOptions(documentUri));
}
