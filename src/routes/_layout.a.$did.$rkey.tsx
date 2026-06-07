import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { quoteShareApi } from "#/integrations/tanstack-query/api-quote-share.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import {
  buildQuoteOgImageUrl,
  decodeQuoteParam,
  truncateQuoteForDisplay,
} from "#/lib/quote-share";
import { useLayoutEffect } from "react";
import { z } from "zod";

import {
  ArticleNotFound,
  ArticleView,
} from "../components/reader/article-view";
import { hasRenderableArticleBody } from "../components/reader/content/extract-text";
import {
  articlePublicationUrl,
  documentUriFromParams,
} from "../components/reader/format";

const articleSearchSchema = z.object({
  q: z.string().optional(),
});

async function resolveSharedQuote(
  documentUri: string,
  shareId: string | undefined,
): Promise<string | null> {
  if (!shareId?.trim()) return null;

  const id = shareId.trim();

  const fromStore = await quoteShareApi
    .resolveQuoteShare({
      data: { documentUri, id },
    })
    .catch(() => null);
  if (fromStore?.quote) return fromStore.quote;

  // Legacy inline base64 quotes were always much longer than stored share ids.
  if (id.length > 12) {
    return decodeQuoteParam(id);
  }

  return null;
}

export const Route = createFileRoute("/_layout/a/$did/$rkey")({
  validateSearch: articleSearchSchema,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: async ({ context, params, deps }) => {
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
        readerApi.getRecommendStatusQueryOptions(uri),
      );
      if (article.publicationUri) {
        await context.queryClient.ensureQueryData(
          readerApi.getFollowStatusQueryOptions(article.publicationUri),
        );
      }
    }
    await context.queryClient.ensureQueryData(user.getSessionQueryOptions);

    const sharedQuote = article
      ? await resolveSharedQuote(article.uri, deps.q)
      : null;

    return { article, sharedQuote };
  },
  head: ({ loaderData, match }) => {
    const article = loaderData?.article as ArticleDetail | null | undefined;
    const quote = loaderData?.sharedQuote ?? null;
    const title = article?.title ?? "Article";
    const publicationName = article?.publication?.name;

    if (!quote || !article || !match.search.q) {
      return {
        meta: [
          {
            title: publicationName ? `${title} · ${publicationName}` : title,
          },
        ],
      };
    }

    const displayQuote = truncateQuoteForDisplay(quote, 120);
    const pageTitle = `"${displayQuote}" · ${title}`;
    const description = publicationName
      ? `${title} — ${publicationName}`
      : title;
    const baseUrl = getPublicUrlClient();
    const search = `?q=${encodeURIComponent(match.search.q)}`;
    const shareUrl = `${baseUrl}${match.pathname}${search}`;
    const ogImage = buildQuoteOgImageUrl(
      match.params.did,
      match.params.rkey,
      match.search.q,
      baseUrl,
    );

    return {
      meta: [
        { title: pageTitle },
        { name: "description", content: description },
        { property: "og:title", content: pageTitle },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: shareUrl },
        { property: "og:image", content: ogImage },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: pageTitle },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
      ],
    };
  },
  component: ArticleRoute,
});

function ArticleRoute() {
  const { did, rkey } = Route.useParams();
  const uri = documentUriFromParams(did, rkey);
  const { sharedQuote } = Route.useLoaderData();
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

  return <ArticleView article={article} sharedQuote={sharedQuote} />;
}
