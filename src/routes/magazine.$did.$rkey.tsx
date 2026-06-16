import type { ArticleDetail } from "#/integrations/tanstack-query/api-publication.functions";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import { getPublicUrlClient } from "#/lib/public-url";
import { siteSocialMeta } from "#/lib/site-metadata";

import { documentUriFromParams } from "../components/reader/format";
import { composeCollectionIssue, composeIssue } from "../magazine/compose";
import { parseIssueIds, pinnedArticleUri } from "../magazine/issue-link";
import { Magazine } from "../magazine/Magazine";

import "../magazine/magazine.css";

/** Cap an edition to a sensible number of features for a single reading. */
const MAX_FEATURES = 16;

const magazineSearchSchema = z.object({
  // `did~rkey,…` — when present, pins the edition to exactly these articles so a
  // shared link keeps showing the same issue even as the list gains new posts.
  ids: z.string().optional(),
});

export const Route = createFileRoute("/magazine/$did/$rkey")({
  validateSearch: magazineSearchSchema,
  loaderDeps: ({ search }) => ({ ids: search.ids }),
  loader: async ({ context, params, deps }) => {
    const { queryClient } = context;
    const { did, rkey } = params;

    const fetchDetail = (uri: string) =>
      queryClient
        .ensureQueryData(publicationApi.getArticleQueryOptions(uri))
        .catch(() => null);

    // Collection mode: did/rkey is a `site.standard.document` carrying a manifest.
    const collectionDoc = await fetchDetail(documentUriFromParams(did, rkey));
    if (collectionDoc?.collection) {
      const manifest = collectionDoc.collection;
      const items = manifest.items.slice(0, MAX_FEATURES);
      const itemDetails = await Promise.all(
        items.map((item) => fetchDetail(item.document)),
      );
      const features = items
        .map((item, i) => ({ detail: itemDetails[i], note: item.note ?? null }))
        .filter(
          (f): f is { detail: ArticleDetail; note: string | null } =>
            f.detail != null,
        );
      return {
        mode: "collection" as const,
        name: collectionDoc.title || collectionDoc.publication?.name || "Collection",
        publicationName: collectionDoc.publication?.name ?? null,
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
      // Pinned edition: exactly these articles, in this order — stable forever.
      articleUris = pinned.slice(0, MAX_FEATURES).map(pinnedArticleUri);
    } else {
      // Live edition: the most recent renderable articles from the list today.
      const feed = await queryClient.ensureQueryData(
        listApi.getListFeedQueryOptions(did, rkey, {
          limit: MAX_FEATURES,
          offset: 0,
        }),
      );
      articleUris = feed.items
        .filter((item) => item.hasRenderableBody)
        .slice(0, MAX_FEATURES)
        .map((item) => item.uri);
    }

    const [listPage, details] = await Promise.all([
      listPagePromise,
      Promise.all(articleUris.map(fetchDetail)),
    ]);

    return {
      mode: "list" as const,
      name: listPage.list?.name ?? "The Standard Issue",
      ownerHandle: listPage.owner?.handle ?? null,
      articles: details.filter((a): a is ArticleDetail => a != null),
    };
  },
  head: ({ loaderData, match }) => {
    const name = loaderData?.name ?? "Standard Reader";
    const baseUrl = getPublicUrlClient();
    return {
      meta: siteSocialMeta({
        title: `${name} · The Standard Issue`,
        description: `Read "${name}" as a magazine edition on Standard Reader.`,
        url: `${baseUrl}${match.pathname}`,
      }),
    };
  },
  component: MagazineRoute,
});

function MagazineRoute() {
  const { did, rkey } = Route.useParams();
  const data = Route.useLoaderData();
  const navigate = useNavigate();

  const issue = useMemo(() => {
    if (data.mode === "collection") {
      return composeCollectionIssue({
        name: data.name,
        publicationName: data.publicationName,
        ownerHandle: data.ownerHandle,
        editorial: data.editorial,
        coverImageUrl: data.coverImageUrl,
        theme: data.theme,
        features: data.features,
      });
    }
    return composeIssue(data.name, data.ownerHandle, data.articles);
  }, [data]);

  const exit = () =>
    data.mode === "collection"
      ? navigate({ to: "/a/$did/$rkey", params: { did, rkey } })
      : navigate({ to: "/l/$did/$rkey", params: { did, rkey } });

  if (issue.features.length === 0) {
    return (
      <div className="mag">
        <div className="building">
          <div>
            <div style={{ marginBottom: 12 }}>Nothing to read here yet.</div>
            <button
              className="toc-btn show"
              style={{ position: "static" }}
              onClick={exit}
            >
              {data.mode === "collection" ? "Back to the collection" : "Back to the list"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <Magazine issue={issue} onExit={exit} />;
}
