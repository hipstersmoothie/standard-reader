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
import { ArticleViewSkeleton } from "../components/reader/article-view-skeleton";
import { hasRenderableArticleBody } from "../components/reader/content/extract-text";
import {
  articlePublicationUrl,
  documentUriFromParams,
} from "../components/reader/format";
import { prefetchCollectionMagazineArticles } from "../magazine/load-magazine-data";

const articleSearchSchema = z.object({
  q: z.string().optional(),
  view: z.literal("reader").optional(),
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
  loaderDeps: ({ search }) => ({ q: search.q, view: search.view }),
  loader: async ({ context, params, deps }) => {
    const uri = documentUriFromParams(params.did, params.rkey);
    const { queryClient } = context;

    // Button states (recommend/bookmark/follow) don't gate the redirect or
    // head meta — fetch them in parallel with the article and let the
    // components pick them up from the cache without blocking navigation.
    void queryClient.prefetchQuery(
      readerApi.getRecommendStatusQueryOptions(uri),
    );
    void queryClient.prefetchQuery(
      readerApi.getBookmarkStatusQueryOptions(uri),
    );

    const [article, openLinks] = await Promise.all([
      queryClient.ensureQueryData(publicationApi.getArticleQueryOptions(uri)),
      queryClient.ensureQueryData(user.getOpenLinksPreferenceQueryOptions),
    ]);
    if (
      article?.collection &&
      !openLinks.openExternally &&
      !deps.q &&
      deps.view !== "reader"
    ) {
      const openInMagazinePref = await queryClient.ensureQueryData(
        user.getOpenCollectionsInMagazinePreferenceQueryOptions,
      );
      if (openInMagazinePref.openInMagazine) {
        prefetchCollectionMagazineArticles(
          queryClient,
          article.collection.items,
        );
        throw redirect({
          to: "/collection/$did/$rkey",
          params: { did: params.did, rkey: params.rkey },
        });
      }
    }

    const sharedQuote = deps.q ? await resolveSharedQuote(uri, deps.q) : null;
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
    if (article?.publicationUri) {
      void queryClient.prefetchQuery(
        readerApi.getFollowStatusQueryOptions(article.publicationUri),
      );
    }
    if (article?.collection) {
      prefetchCollectionMagazineArticles(queryClient, article.collection.items);
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
  pendingComponent: ArticleViewSkeleton,
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
