import { useLingui } from "@lingui/react/macro";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { documentImages } from "#/lib/document/images";
import { getPublicUrlClient } from "#/lib/public-url";
import { articleOgImageUrl, siteSocialMeta } from "#/lib/site-metadata";

import { ComicNotFound } from "../components/comic/comic-not-found";
import { ComicReader } from "../components/comic/comic-reader";
import { documentUriFromParams } from "../components/reader/format";

const comicSearchSchema = z.object({
  /** 1-based page; one past the last page is the end-of-issue card. */
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/comic/$did/$rkey")({
  validateSearch: comicSearchSchema,
  loader: async ({ context, params, preload }) => {
    const uri = documentUriFromParams(params.did, params.rkey);
    const { queryClient } = context;
    const seriesOptions = publicationApi.getSeriesContextQueryOptions(uri);

    if (preload) {
      void queryClient.prefetchQuery(
        publicationApi.getArticleQueryOptions(uri),
      );
      void queryClient.prefetchQuery(seriesOptions);
      return { title: null, publicationName: null, description: null };
    }

    // The series context feeds the end-of-issue card, which sits past the last
    // page — warm it without holding up the first page's paint.
    void queryClient.prefetchQuery(seriesOptions);

    const article = await queryClient.ensureQueryData(
      publicationApi.getArticleQueryOptions(uri),
    );
    if (!article) {
      return { title: null, publicationName: null, description: null };
    }

    // Nothing to flip through — the reading view is the honest fallback, and
    // `view=reader` stops it bouncing straight back here.
    if (documentImages(article).length === 0) {
      throw redirect({
        to: "/a/$did/$rkey",
        params: { did: params.did, rkey: params.rkey },
        search: { view: "reader" },
      });
    }

    return {
      title: article.title,
      publicationName: article.publication?.name ?? null,
      description: article.description,
      // The records this page is built from — rendered by `AtRecordMeta`.
      atMeta: {
        canonical: [uri],
        alternate: [article.publicationUri],
        author: [article.did],
      },
    };
  },
  head: ({ loaderData, match }) => {
    const title = loaderData?.title;
    if (!title) {
      return { meta: [{ title: "Standard Reader" }] };
    }
    const publicationName = loaderData?.publicationName;
    const pageTitle = publicationName ? `${title} · ${publicationName}` : title;
    const baseUrl = getPublicUrlClient();
    return {
      meta: siteSocialMeta({
        title: pageTitle,
        description:
          loaderData?.description?.trim() ||
          (publicationName ? `${title} — ${publicationName}` : title),
        url: `${baseUrl}${match.pathname}`,
        ogImage: articleOgImageUrl(
          baseUrl,
          match.params.did,
          match.params.rkey,
        ),
        ogType: "article",
      }),
      // standard.site discovery hint — the AT-URI of the rendered document.
      links: [
        {
          rel: "site.standard.document",
          href: documentUriFromParams(match.params.did, match.params.rkey),
        },
      ],
    };
  },
  component: ComicRoute,
});

function ComicRoute() {
  const { did, rkey } = Route.useParams();
  const { page } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { t } = useLingui();
  const uri = documentUriFromParams(did, rkey);

  const { data: article } = useSuspenseQuery(
    publicationApi.getArticleQueryOptions(uri),
  );
  const { data: series } = useQuery(
    publicationApi.getSeriesContextQueryOptions(uri),
  );
  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);

  if (!article) {
    return <ComicNotFound />;
  }

  return (
    <div aria-label={t`Comic reader`}>
      <ComicReader
        key={article.uri}
        article={article}
        series={series}
        page={page ?? 1}
        // Page turns replace the entry so Back leaves the reader rather than
        // walking every page in reverse; the page still lives in the URL, so a
        // reload or a shared link lands where the reader left off.
        onPageChange={(next) => {
          void navigate({
            search: { page: next },
            replace: true,
            resetScroll: false,
          });
        }}
        signedIn={Boolean(session?.user)}
      />
    </div>
  );
}
