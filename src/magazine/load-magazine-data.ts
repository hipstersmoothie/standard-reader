import type { QueryClient } from "@tanstack/react-query";
import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";
import type { CollectionEditorial } from "#/lib/collections/manifest";

import {
  documentUriFromParams,
  publicationLinkParams,
} from "#/components/reader/format";
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
    const manifest = collectionDoc.collection;
    const items = manifest.items.slice(0, MAX_MAGAZINE_FEATURES);
    const itemDetails = await Promise.all(
      items.map((item) => fetchArticleDetail(queryClient, item.document)),
    );
    const features = items
      .map((item, i) => ({ detail: itemDetails[i], note: item.note ?? null }))
      .filter(
        (f): f is { detail: ArticleDetail; note: string | null } =>
          f.detail != null,
      );
    return {
      mode: "collection",
      name:
        collectionDoc.title || collectionDoc.publication?.name || "Collection",
      publicationName: collectionDoc.publication?.name ?? null,
      publicationParams: collectionDoc.publicationUri
        ? publicationLinkParams(collectionDoc.publicationUri)
        : null,
      ownerHandle: collectionDoc.publicationOwnerHandle,
      editorial: manifest.editorial ?? null,
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
