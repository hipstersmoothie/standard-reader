import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { useLayoutEffect } from "react";

import {
  ArticleNotFound,
  ArticleView,
} from "../components/reader/article-view";
import { hasRenderableArticleBody } from "../components/reader/content/extract-text";
import {
  articlePublicationUrl,
  documentUriFromParams,
} from "../components/reader/format";

export const Route = createFileRoute("/_layout/a/$did/$rkey")({
  loader: async ({ context, params }) => {
    const uri = documentUriFromParams(params.did, params.rkey);
    const article = await context.queryClient.ensureQueryData(
      publicationApi.getArticleQueryOptions(uri),
    );
    if (article && !hasRenderableArticleBody(article)) {
      const externalUrl = articlePublicationUrl(article);
      if (externalUrl) {
        throw redirect({ href: externalUrl });
      }
    }
    if (article) {
      await context.queryClient.ensureQueryData(
        readerApi.getBookmarkStatusQueryOptions(uri),
      );
      if (article.publicationUri) {
        await context.queryClient.ensureQueryData(
          readerApi.getFollowStatusQueryOptions(article.publicationUri),
        );
      }
    }
    await context.queryClient.ensureQueryData(user.getSessionQueryOptions);
  },
  component: ArticleRoute,
});

function ArticleRoute() {
  const { did, rkey } = Route.useParams();
  const uri = documentUriFromParams(did, rkey);
  const { data: article } = useSuspenseQuery(
    publicationApi.getArticleQueryOptions(uri),
  );

  useLayoutEffect(() => {
    if (!article || hasRenderableArticleBody(article)) return;
    const externalUrl = articlePublicationUrl(article);
    if (externalUrl) {
      window.location.replace(externalUrl);
    }
  }, [article]);

  if (!article) {
    return <ArticleNotFound />;
  }

  return <ArticleView article={article} />;
}
