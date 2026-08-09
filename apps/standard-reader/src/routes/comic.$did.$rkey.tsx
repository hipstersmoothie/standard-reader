import { useLingui } from "@lingui/react/macro";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { comicChunkOffset } from "#/components/comic/use-comic-pages";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { documentImages } from "#/lib/document/images";
import { getPublicUrlClient } from "#/lib/public-url";
import {
  articleOgImageUrl,
  canonicalLink,
  siteSocialMeta,
} from "#/lib/site-metadata";

import { ComicNotFound } from "../components/comic/comic-not-found";
import { ComicReader } from "../components/comic/comic-reader";
import {
  articleSourceUrl,
  documentUriFromParams,
} from "../components/reader/format";

const comicSearchSchema = z.object({
  /** 1-based page; one past the last page is the end-of-issue card. */
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/comic/$did/$rkey")({
  validateSearch: comicSearchSchema,
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ context, params, preload, deps }) => {
    const uri = documentUriFromParams(params.did, params.rkey);
    const { queryClient } = context;
    if (preload) {
      void queryClient.prefetchQuery(
        publicationApi.getArticleQueryOptions(uri),
      );
      return {
        title: null,
        publicationName: null,
        description: null,
        sourceUrl: null,
      };
    }

    const article = await queryClient.ensureQueryData(
      publicationApi.getArticleQueryOptions(uri),
    );
    if (!article) {
      return {
        title: null,
        publicationName: null,
        description: null,
        sourceUrl: null,
      };
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

    // The reader spans the whole publication, so the spine — every issue's
    // title and length — is what it opens on. Awaited: without it there are no
    // absolute page numbers and nowhere to place the issue that was clicked.
    if (article.publicationUri) {
      const spine = await queryClient
        .ensureQueryData(
          publicationApi.getComicSpineQueryOptions(article.publicationUri),
        )
        .catch(() => null);

      // Warm the chunk holding the page this request actually opens on, not
      // the first chunk in the book. A deep link (`?page=30`) or an entry
      // through a late issue otherwise paints a loading placeholder and only
      // finds its page after hydration.
      if (spine) {
        const startIndex =
          deps.page == null
            ? (spine.issues.find((issue) => issue.uri === uri)?.pageOffset ?? 0)
            : deps.page - 1;
        const issueIndex = Math.max(
          0,
          spine.issues.findIndex(
            (issue) => startIndex < issue.pageOffset + issue.pageCount,
          ),
        );
        await queryClient
          .ensureQueryData(
            publicationApi.getComicPagesQueryOptions(
              article.publicationUri,
              comicChunkOffset(issueIndex),
            ),
          )
          .catch(() => null);
      }
    }

    return {
      title: article.title,
      publicationName: article.publication?.name ?? null,
      publicationUri: article.publicationUri,
      description: article.description,
      sourceUrl: articleSourceUrl(article),
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
      links: [
        // The issue's page on the publication's own site, when it has one —
        // the page-flip reader is our presentation of their comic, not a
        // separate work. Also collapses the `?page=` deep links onto one URL.
        canonicalLink(`${baseUrl}${match.pathname}`, loaderData?.sourceUrl),
        // standard.site discovery hint — the AT-URI of the rendered document.
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
  const { data: session } = useSuspenseQuery(user.getSessionQueryOptions);

  if (!article) {
    return <ComicNotFound />;
  }

  return (
    <div aria-label={t`Comic reader`}>
      <ComicReader
        // Keyed by publication, not by document: crossing from one issue into
        // the next is a page turn inside one reader, not a new reader.
        key={article.publicationUri ?? article.uri}
        publicationUri={article.publicationUri}
        publicationName={article.publication?.name ?? null}
        anchorIssueUri={article.uri}
        page={page}
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
