import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";

import {
  documentUriFromParams,
  publicationLinkParams,
} from "#/components/reader/format";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";
import type {
  ArticleDetail,
  CollectionMagazineData,
} from "#/integrations/tanstack-query/api-publication.functions";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { getQueryClient } from "#/integrations/tanstack-query/query-client";
import type {
  CollectionColophon,
  CollectionEditorial,
} from "#/lib/collections/manifest";

import { MAX_MAGAZINE_FEATURES } from "./constants";
import { parseIssueIds, pinnedArticleUri } from "./issue-link";
import type { MagazineShellData } from "./types";

export { MAX_MAGAZINE_FEATURES };
export type { MagazineShellData };

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
      colophon: CollectionColophon | null;
      coverImageUrl: string | null;
      theme: ArticleDetail["collectionTheme"];
      features: Array<{ detail: ArticleDetail; note: string | null }>;
    }
  | {
      mode: "list";
      name: string;
      ownerHandle: string | null;
      listUri: string | null;
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

/** Seed per-article caches from a collection magazine bundle. */
export function seedCollectionMagazineCaches(
  queryClient: QueryClient,
  data: CollectionMagazineData,
): void {
  queryClient.setQueryData(
    publicationApi.getArticleQueryOptions(data.collectionDoc.uri).queryKey,
    data.collectionDoc,
  );
  for (const feature of data.features) {
    queryClient.setQueryData(
      publicationApi.getArticleQueryOptions(feature.detail.uri).queryKey,
      feature.detail,
    );
  }
}

/** Warm the collection magazine bundle (one server round trip). */
export function prefetchCollectionMagazine(
  queryClient: QueryClient,
  params: { did: string; rkey: string },
): void {
  void queryClient.prefetchQuery(
    publicationApi.getCollectionQueryOptions(
      documentUriFromParams(params.did, params.rkey),
    ),
  );
}

/** @deprecated Use {@link prefetchCollectionMagazine}. */
export function prefetchCollectionMagazineArticles(
  queryClient: QueryClient,
  _items: ReadonlyArray<{ document: string }>,
  params?: { did: string; rkey: string },
): void {
  if (params) {
    prefetchCollectionMagazine(queryClient, params);
  }
}

export type MagazineCollectionBootstrap = {
  name: string;
  publicationName: string | null;
  publicationUri: string | null;
  publicationParams: { did: string; rkey: string } | null;
  ownerHandle: string | null;
  editorial: CollectionEditorial | null;
  colophon: CollectionColophon | null;
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

export function shellFromCollectionData(
  data: CollectionMagazineData,
): MagazineShellData {
  return {
    isCollection: true,
    theme: data.theme,
  };
}

export function bootstrapFromCollectionData(
  data: CollectionMagazineData,
): MagazineCollectionBootstrap {
  return {
    name: data.name,
    publicationName: data.publicationName,
    publicationUri: data.publicationUri,
    publicationParams: data.publicationParams,
    ownerHandle: data.ownerHandle,
    editorial: data.editorial,
    colophon: data.colophon,
    coverImageUrl: data.coverImageUrl,
    theme: data.theme,
  };
}

/** @deprecated Use {@link bootstrapFromCollectionData}. */
export function bootstrapFromCollectionDoc(
  article: ArticleDetail,
): MagazineCollectionBootstrap | null {
  if (!article.collection) return null;
  return {
    name: article.title || article.publication?.name || "Collection",
    publicationName: article.publication?.name ?? null,
    publicationUri: article.publicationUri,
    publicationParams: article.publicationUri
      ? publicationLinkParams(article.publicationUri)
      : null,
    ownerHandle: article.publicationOwnerHandle,
    editorial: article.collection.editorial ?? null,
    colophon: article.collection.colophon ?? null,
    coverImageUrl: article.coverImageUrl,
    theme: article.collectionTheme,
  };
}

function collectionLoaderDataFromBundle(
  data: CollectionMagazineData,
): MagazineLoaderData {
  return {
    mode: "collection",
    name: data.name,
    publicationName: data.publicationName,
    publicationParams: data.publicationParams,
    ownerHandle: data.ownerHandle,
    editorial: data.editorial,
    colophon: data.colophon,
    coverImageUrl: data.coverImageUrl,
    theme: data.theme,
    features: data.features,
  };
}

export function getCollectionMagazineQueryOptions(params: {
  did: string;
  rkey: string;
}) {
  const uri = documentUriFromParams(params.did, params.rkey);
  return queryOptions({
    queryKey: ["magazine", "collection", params.did, params.rkey] as const,
    queryFn: async () =>
      publicationApi.getCollection({ data: { documentUri: uri } }),
    staleTime: 60_000,
  });
}

export async function loadMagazineShell(
  queryClient: QueryClient,
  params: { did: string; rkey: string },
): Promise<MagazineShellData> {
  const uri = documentUriFromParams(params.did, params.rkey);
  const collection = await queryClient
    .ensureQueryData(publicationApi.getCollectionQueryOptions(uri))
    .catch(() => null);
  if (collection) {
    return shellFromCollectionData(collection);
  }

  const article = await fetchArticleDetail(queryClient, uri);
  return shellFromArticle(article);
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
  const collectionUri = documentUriFromParams(did, rkey);

  const collection = await queryClient
    .ensureQueryData(publicationApi.getCollectionQueryOptions(collectionUri))
    .catch(() => null);
  if (collection) {
    seedCollectionMagazineCaches(queryClient, collection);
    return collectionLoaderDataFromBundle(collection);
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
    listUri: listPage.list?.uri ?? null,
    articles: details.filter((a): a is ArticleDetail => a != null),
  };
}
