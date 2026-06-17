import type { QueryClient } from "@tanstack/react-query";
import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import type { CollectionEditorial } from "#/lib/collections/manifest";

import { queryOptions } from "@tanstack/react-query";
import {
  documentUriFromParams,
  publicationLinkParams,
} from "#/components/reader/format";
import { getQueryClient } from "#/integrations/tanstack-query/query-client";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";

import { parseIssueIds, pinnedArticleUri } from "./issue-link";

/** Cap an edition to a sensible number of features for a single reading. */
export const MAX_MAGAZINE_FEATURES = 16;

type MagazineSearchDeps = {
  ids?: string;
};

export type MagazineLoaderData =
  | {
      mode: "collection";
      name: string;
      publicationName: string | null;
      publicationParams: { did: string; rkey: string } | null;
      ownerHandle: string | null;
      editorial: CollectionEditorial | null;
      coverImageUrl: string | null;
      theme: ArticleDetail["collectionTheme"];
      features: Array<{ detail: ArticleDetail; note: string | null }>;
    }
  | {
      mode: "list";
      name: string;
      ownerHandle: string | null;
      articles: Array<ArticleDetail>;
    };

function fetchArticleDetail(
  queryClient: QueryClient,
  uri: string,
): Promise<ArticleDetail | null> {
  return queryClient
    .ensureQueryData(publicationApi.getArticleQueryOptions(uri))
    .catch(() => null);
}

/** Warm article caches for a collection's magazine edition. */
export function prefetchCollectionMagazineArticles(
  queryClient: QueryClient,
  items: ReadonlyArray<{ document: string }>,
): void {
  for (const item of items.slice(0, MAX_MAGAZINE_FEATURES)) {
    void queryClient.prefetchQuery(
      publicationApi.getArticleQueryOptions(item.document),
    );
  }
}

export type MagazineShellData = {
  isCollection: boolean;
  theme: ArticleDetail["collectionTheme"];
};

export type MagazineCollectionBootstrap = {
  name: string;
  publicationName: string | null;
  publicationParams: { did: string; rkey: string } | null;
  ownerHandle: string | null;
  editorial: CollectionEditorial | null;
  coverImageUrl: string | null;
  theme: ArticleDetail["collectionTheme"];
};

export function shellFromArticle(
  article: ArticleDetail | null | undefined,
): MagazineShellData {
  return {
    isCollection: Boolean(article?.collection),
    theme: article?.collectionTheme ?? null,
  };
}

export function bootstrapFromCollectionDoc(
  article: ArticleDetail,
): MagazineCollectionBootstrap | null {
  if (!article.collection) return null;
  return {
    name: article.title || article.publication?.name || "Collection",
    publicationName: article.publication?.name ?? null,
    publicationParams: article.publicationUri
      ? publicationLinkParams(article.publicationUri)
      : null,
    ownerHandle: article.publicationOwnerHandle,
    editorial: article.collection.editorial ?? null,
    coverImageUrl: article.coverImageUrl,
    theme: article.collectionTheme,
  };
}

export async function loadMagazineCollectionFeatures(
  queryClient: QueryClient,
  params: { did: string; rkey: string },
): Promise<Array<{ detail: ArticleDetail; note: string | null }>> {
  const collectionDoc = await fetchArticleDetail(
    queryClient,
    documentUriFromParams(params.did, params.rkey),
  );
  if (!collectionDoc?.collection) return [];

  const items = collectionDoc.collection.items.slice(0, MAX_MAGAZINE_FEATURES);
  const itemDetails = await Promise.all(
    items.map((item) => fetchArticleDetail(queryClient, item.document)),
  );
  return items
    .map((item, i) => ({ detail: itemDetails[i], note: item.note ?? null }))
    .filter(
      (f): f is { detail: ArticleDetail; note: string | null } =>
        f.detail != null,
    );
}

export function getMagazineCollectionFeaturesQueryOptions(params: {
  did: string;
  rkey: string;
}) {
  return queryOptions({
    queryKey: ["magazine", "features", params.did, params.rkey] as const,
    queryFn: () => loadMagazineCollectionFeatures(getQueryClient(), params),
    staleTime: 60_000,
  });
}

export async function loadMagazineShell(
  queryClient: QueryClient,
  params: { did: string; rkey: string },
): Promise<MagazineShellData> {
  const article = await fetchArticleDetail(
    queryClient,
    documentUriFromParams(params.did, params.rkey),
  );
  return {
    isCollection: Boolean(article?.collection),
    theme: article?.collectionTheme ?? null,
  };
}

export function getMagazineShellQueryOptions(params: {
  did: string;
  rkey: string;
}) {
  return queryOptions({
    queryKey: ["magazine", "shell", params.did, params.rkey] as const,
    queryFn: () => loadMagazineShell(getQueryClient(), params),
    staleTime: 60_000,
  });
}

export function getMagazineDataQueryOptions(
  params: { did: string; rkey: string },
  deps: MagazineSearchDeps = {},
) {
  return queryOptions({
    queryKey: ["magazine", params.did, params.rkey, deps.ids ?? ""] as const,
    queryFn: () => loadMagazineData(getQueryClient(), params, deps),
    staleTime: 60_000,
  });
}

export async function loadMagazineData(
  queryClient: QueryClient,
  params: { did: string; rkey: string },
  deps: MagazineSearchDeps,
): Promise<MagazineLoaderData> {
  const { did, rkey } = params;

  // Collection mode: did/rkey is a `site.standard.document` carrying a manifest.
  const collectionDoc = await fetchArticleDetail(
    queryClient,
    documentUriFromParams(did, rkey),
  );
  if (collectionDoc?.collection) {
    const features = await loadMagazineCollectionFeatures(queryClient, params);
    return {
      mode: "collection",
      name:
        collectionDoc.title || collectionDoc.publication?.name || "Collection",
      publicationName: collectionDoc.publication?.name ?? null,
      publicationParams: collectionDoc.publicationUri
        ? publicationLinkParams(collectionDoc.publicationUri)
        : null,
      ownerHandle: collectionDoc.publicationOwnerHandle,
      editorial: collectionDoc.collection.editorial ?? null,
      coverImageUrl: collectionDoc.coverImageUrl,
      theme: collectionDoc.collectionTheme,
      features,
    };
  }

  // List mode (legacy): did/rkey is a publication list; compose its articles.
  const pinned = deps.ids ? parseIssueIds(deps.ids) : [];
  const listPagePromise = queryClient.ensureQueryData(
    listApi.getListQueryOptions(did, rkey),
  );

  let articleUris: Array<string>;
  if (pinned.length > 0) {
    articleUris = pinned
      .slice(0, MAX_MAGAZINE_FEATURES)
      .map((item) => pinnedArticleUri(item));
  } else {
    const feed = await queryClient.ensureQueryData(
      listApi.getListFeedQueryOptions(did, rkey, {
        limit: MAX_MAGAZINE_FEATURES,
        offset: 0,
      }),
    );
    articleUris = feed.items
      .filter((item) => item.hasRenderableBody)
      .slice(0, MAX_MAGAZINE_FEATURES)
      .map((item) => item.uri);
  }

  const [listPage, details] = await Promise.all([
    listPagePromise,
    Promise.all(articleUris.map((uri) => fetchArticleDetail(queryClient, uri))),
  ]);

  return {
    mode: "list",
    name: listPage.list?.name ?? "The Standard Issue",
    ownerHandle: listPage.owner?.handle ?? null,
    articles: details.filter((a): a is ArticleDetail => a != null),
  };
}
