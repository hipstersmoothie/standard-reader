import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { quoteShareApi } from "#/integrations/tanstack-query/api-quote-share.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { buildQuoteOgImageUrl, decodeQuoteParam } from "#/lib/quote-share";
import { articleOgImageUrl, siteSocialMeta } from "#/lib/site-metadata";
import { useOpenLinks } from "#/lib/use-open-links";
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
    const [article, openLinks] = await Promise.all([
      context.queryClient.ensureQueryData(
        publicationApi.getArticleQueryOptions(uri),
      ),
      context.queryClient.ensureQueryData(
        user.getOpenLinksPreferenceQueryOptions,
      ),
    ]);
    // Bounce to the publication site when the body isn't renderable in-app, or
    // when the reader prefers links to open on the original site.
    if (
      article &&
      (openLinks.openExternally || !hasRenderableArticleBody(article))
    ) {
      const externalUrl = articlePublicationUrl(article);
      if (externalUrl) {
        throw redirect({ href: externalUrl });
      }
    }
    let sharedQuote: string | null = null;

    if (article) {
      const results = await Promise.all([
        context.queryClient.ensureQueryData(user.getSessionQueryOptions),
        context.queryClient.ensureQueryData(
          readerApi.getRecommendStatusQueryOptions(uri),
        ),
        context.queryClient.ensureQueryData(
          readerApi.getBookmarkStatusQueryOptions(uri),
        ),
        article.publicationUri
          ? context.queryClient.ensureQueryData(
              readerApi.getFollowStatusQueryOptions(article.publicationUri),
            )
          : Promise.resolve(),
        deps.q
          ? resolveSharedQuote(article.uri, deps.q)
          : Promise.resolve(null),
      ]);
      const quote = results[4];
      sharedQuote = typeof quote === "string" ? quote : null;
    } else {
      await context.queryClient.ensureQueryData(user.getSessionQueryOptions);
    }

    return { article, sharedQuote };
  },
  head: ({ loaderData, match }) => {
    const article = loaderData?.article as ArticleDetail | null | undefined;
    const quote = loaderData?.sharedQuote ?? null;
    const title = article?.title ?? "Article";
    const publicationName = article?.publication?.name;
    const pageTitle = publicationName ? `${title} · ${publicationName}` : title;
    const description =
      article?.description?.trim() ||
      (publicationName ? `${title} — ${publicationName}` : title);

    if (!article) {
      return {
        meta: [{ title: pageTitle }],
      };
    }

    // standard.site discovery hints — the AT-URIs of the records this page
    // renders. See https://standard.site/docs/verification/#discovery-hint
    const links = [
      { rel: "site.standard.document", href: article.uri },
      ...(article.publicationUri
        ? [{ rel: "site.standard.publication", href: article.publicationUri }]
        : []),
    ];

    if (!quote || !match.search.q) {
      const baseUrl = getPublicUrlClient();
      return {
        meta: siteSocialMeta({
          title: pageTitle,
          description,
          url: `${baseUrl}${match.pathname}`,
          ogImage: articleOgImageUrl(
            baseUrl,
            match.params.did,
            match.params.rkey,
          ),
          ogType: "article",
        }),
        links,
      };
    }

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
      links,
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
  const { openExternally } = useOpenLinks();

  useLayoutEffect(() => {
    if (!article) return;
    if (!openExternally && hasRenderableArticleBody(article)) return;
    const externalUrl = articlePublicationUrl(article);
    if (externalUrl) {
      globalThis.location.replace(externalUrl);
    }
  }, [article, openExternally]);

  if (!article) {
    return <ArticleNotFound />;
  }

  return (
    <ArticleView
      key={article.uri}
      article={article}
      sharedQuote={sharedQuote}
    />
  );
}
