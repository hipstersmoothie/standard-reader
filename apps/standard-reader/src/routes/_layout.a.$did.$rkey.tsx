import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { z } from "zod";

import { blocksApi } from "#/integrations/tanstack-query/api-blocks.functions";
import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { quoteShareApi } from "#/integrations/tanstack-query/api-quote-share.functions";
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { documentImages } from "#/lib/document/images";
import { getPublicUrlClient } from "#/lib/public-url";
import {
  buildQuoteOgImageUrl,
  decodeQuoteParam,
  truncateQuoteForDisplay,
} from "#/lib/quote-share";
import {
  articleOgImageUrl,
  canonicalLink,
  siteSocialMeta,
} from "#/lib/site-metadata";
import { useOpenLinks } from "#/lib/use-open-links";

import {
  ArticleNotFound,
  ArticleView,
} from "../components/reader/article-view";
import { ArticleViewSkeleton } from "../components/reader/article-view-skeleton";
import { BlockedNotice } from "../components/reader/blocked-notice";
import { hasRenderableArticleBody } from "../components/reader/content/extract-text";
import {
  articlePublicationUrl,
  articleSourceUrl,
  documentUriFromParams,
} from "../components/reader/format";
import type { PublicationThemeColors } from "../components/reader/publication-theme-scale";
import { prefetchCollectionMagazine } from "../magazine/load-magazine-data";

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
        prefetchCollectionMagazine(queryClient, {
          did: params.did,
          rkey: params.rkey,
        });
        throw redirect({
          to: "/collection/$did/$rkey",
          params: { did: params.did, rkey: params.rkey },
        });
      }
    }

    // A comic issue is pages of art, so it opens in the page-flip reader rather
    // than as a column of stacked images. `view=reader` is the way back to the
    // article (the author's notes live there), and a shared quote always wants
    // the reading view — that's where the highlight is.
    if (
      article?.publication?.serial?.kind === "comic" &&
      !openLinks.openExternally &&
      !deps.q &&
      deps.view !== "reader" &&
      documentImages(article).length > 0
    ) {
      throw redirect({
        to: "/comic/$did/$rkey",
        params: { did: params.did, rkey: params.rkey },
      });
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
      prefetchCollectionMagazine(queryClient, {
        did: params.did,
        rkey: params.rkey,
      });
    }

    // `publicationTheme` is read by `PublicationThemeScope` in the app shell —
    // see its doc comment.
    return {
      article,
      sharedQuote,
      publicationTheme: articleThemeColors(article),
      // The records this page is built from — rendered by `AtRecordMeta`. The
      // document is why the page exists; the publication it belongs to and its
      // companion Bluesky post are things the page merely shows. Nothing is
      // claimed when the document didn't resolve — a page that failed to find
      // its record shouldn't assert one.
      atMeta: article
        ? {
            canonical: [uri],
            alternate: [article.publicationUri, article.bskyPostUri],
            author: [article.did],
          }
        : {},
    };
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

    const baseUrl = getPublicUrlClient();
    const links = [
      // The publication's own page for this article, when it has one — we
      // render their writing natively, so the ranking signals belong to them
      // and not to us. Shared-quote links (`?q=`) fold into the bare article.
      canonicalLink(`${baseUrl}${match.pathname}`, articleSourceUrl(article)),
      // standard.site discovery hints — the AT-URIs of the records this page
      // renders. See https://standard.site/docs/verification/#discovery-hint
      { rel: "site.standard.document", href: article.uri },
      ...(article.publicationUri
        ? [{ rel: "site.standard.publication", href: article.publicationUri }]
        : []),
    ];

    if (!quote || !match.search.q) {
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

    const search = `?q=${encodeURIComponent(match.search.q)}`;
    const shareUrl = `${baseUrl}${match.pathname}${search}`;
    const ogImage = buildQuoteOgImageUrl(
      match.params.did,
      match.params.rkey,
      match.search.q,
      baseUrl,
    );

    // Surface the highlighted quote itself as the card description so the
    // shared excerpt reads in the link preview, not the article's own blurb.
    const quoteDescription = `“${truncateQuoteForDisplay(quote, 1000)}”`;

    return {
      meta: [
        { title: pageTitle },
        { name: "description", content: quoteDescription },
        { property: "og:title", content: pageTitle },
        { property: "og:description", content: quoteDescription },
        { property: "og:type", content: "article" },
        { property: "og:url", content: shareUrl },
        { property: "og:image", content: ogImage },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: pageTitle },
        { name: "twitter:description", content: quoteDescription },
        { name: "twitter:image", content: ogImage },
      ],
      links,
    };
  },
  pendingComponent: ArticleViewSkeleton,
  component: ArticleRoute,
});

/**
 * The article didn't resolve. Usually that means it isn't indexed — but it also
 * means "withheld because of a block", and those two deserve different words.
 *
 * The reason is fetched here rather than returned by `getArticle`, which sends
 * `null` for a blocked document on purpose: nothing about it, not even its
 * title, should cross the wire. So the explanation costs one extra read, and
 * only on the page that already found nothing.
 */
function ArticleMissing({ uri }: { uri: string }) {
  const { data: blockState, isPending } = useQuery(
    publicationApi.getArticleBlockQueryOptions(uri),
  );
  const blocks = useQuery(
    blocksApi.getBlocksSettingsQueryOptions({ limit: 1 }),
  );

  // Nothing while the reason is still unknown: flashing "we couldn't find that
  // article" and then replacing it with "you blocked this account" reads as the
  // app changing its mind.
  if (isPending) return null;
  if (!blockState) return <ArticleNotFound />;

  return (
    <BlockedNotice
      block={blockState.block}
      name={blockState.account.displayName ?? blockState.account.handle}
      canWrite={blocks.data?.canWrite ?? false}
    />
  );
}

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
    return <ArticleMissing uri={uri} />;
  }

  return (
    <ArticleView
      key={article.uri}
      article={article}
      sharedQuote={sharedQuote}
    />
  );
}

/**
 * The owning publication's theme colors, as carried on the article itself.
 * `collectionTheme` is populated for every article with a publication (not just
 * collections), so the palette is already on the page — no extra round trip.
 */
function articleThemeColors(
  article: ArticleDetail | null | undefined,
): PublicationThemeColors {
  const theme = article?.collectionTheme;
  return {
    themeBackground: theme?.background ?? null,
    themeForeground: theme?.foreground ?? null,
    themeAccent: theme?.accent ?? null,
    themeAccentForeground: theme?.accentForeground ?? null,
    dark: theme?.dark ?? null,
    surface: theme?.surface ?? null,
    surfaceHover: theme?.surfaceHover ?? null,
    border: theme?.border ?? null,
    fonts: theme?.publicationFonts ?? null,
    canvas: theme?.canvas ?? null,
    backgroundImage: theme?.publicationBackgroundImage ?? null,
  };
}
