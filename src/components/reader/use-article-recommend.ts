"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { useLoginSearch } from "#/utils/use-login-search";

import {
  applyRecommendOptimisticUpdate,
  recommendCountFromCache,
  rollbackRecommendOptimisticUpdate,
} from "./recommend-optimistic";

export function useArticleRecommend(
  documentUri: string,
  signedIn: boolean,
  initialRecommendCount: number,
) {
  const navigate = useNavigate();
  const loginSearch = useLoginSearch();
  const queryClient = useQueryClient();

  const { data: status } = useSuspenseQuery(
    readerApi.getRecommendStatusQueryOptions(documentUri),
  );

  const recommendMutation = useMutation(
    readerApi.recommendDocumentMutationOptions(),
  );
  const unrecommendMutation = useMutation(
    readerApi.unrecommendDocumentMutationOptions(),
  );

  const recommended = status.isRecommended;
  const recommendCount = recommendCountFromCache(
    queryClient,
    documentUri,
    initialRecommendCount,
  );

  const toggle = () => {
    if (!signedIn) {
      void navigate({ to: "/login", search: loginSearch });
      return;
    }
    const next = !recommended;
    const optimistic = applyRecommendOptimisticUpdate(
      queryClient,
      documentUri,
      next,
    );
    const mutation = next ? recommendMutation : unrecommendMutation;
    mutation.mutate(documentUri, {
      onError: () =>
        rollbackRecommendOptimisticUpdate(queryClient, documentUri, optimistic),
    });
  };

  const isPending =
    recommendMutation.isPending || unrecommendMutation.isPending;

  return { recommended, recommendCount, toggle, isPending };
}
