"use client";

import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  useCanGoBack,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { exitMagazineViewer } from "#/lib/exit-magazine-viewer";
import { collectionReaderViewSearch } from "#/lib/open-collections-in-magazine";
import { getPublicUrlClient } from "#/lib/public-url";
import { siteSocialMeta } from "#/lib/site-metadata";
import { useOpenCollectionsInMagazine } from "#/lib/use-open-collections-in-magazine";
import { useMemo } from "react";
import { z } from "zod";

import { documentUriFromParams } from "../components/reader/format";
import { publicationApi } from "../integrations/tanstack-query/api-publication.functions";
import { composeCollectionIssue, composeIssue } from "../magazine/compose";
import { magazineThemeFontHeadLinks } from "../magazine/font-preload";
import {
  bootstrapFromCollectionDoc,
  getMagazineCollectionFeaturesQueryOptions,
  getMagazineDataQueryOptions,
  shellFromArticle,
  type MagazineShellData,
} from "../magazine/load-magazine-data";
import { Magazine } from "../magazine/Magazine";
import { MagazineShell } from "../magazine/magazine-shell";
import "../magazine/magazine.css";

const collectionSearchSchema = z.object({
  // `did~rkey,…` — when present, pins the edition to exactly these articles so a
  // shared link keeps showing the same issue even as the list gains new posts.
  ids: z.string().optional(),
});

function collectionPendingLabel(shell: MagazineShellData | null | undefined) {
  return shell?.isCollection === false
    ? "Opening the issue…"
    : "Opening the collection…";
}

function CollectionPendingView({
  shell,
}: {
  shell: MagazineShellData | null | undefined;
}) {
  return (
    <MagazineShell
      theme={shell?.theme ?? null}
      aria-busy="true"
      aria-label="Loading collection"
    >
      <div className="building">
        <div>
          <div className="spin" />
          {collectionPendingLabel(shell)}
        </div>
      </div>
    </MagazineShell>
  );
}

export function CollectionPending() {
  return <CollectionPendingView shell={null} />;
}

export const Route = createFileRoute("/collection/$did/$rkey")({
  validateSearch: collectionSearchSchema,
  loaderDeps: ({ search }) => ({ ids: search.ids }),
  loader: async ({ context, params, preload, deps }) => {
    const uri = documentUriFromParams(params.did, params.rkey);
    const articleOptions = publicationApi.getArticleQueryOptions(uri);
    const featuresOptions = getMagazineCollectionFeaturesQueryOptions(params);
    const listDataOptions = getMagazineDataQueryOptions(params, deps);

    if (preload) {
      void context.queryClient.prefetchQuery(articleOptions);
      void context.queryClient.prefetchQuery(featuresOptions);
      void context.queryClient.prefetchQuery(listDataOptions);
      return { shell: null, bootstrap: null };
    }

    // Feature articles load client-side; kick them off while the collection doc
    // (publication) resolves so nav only blocks on that one round trip.
    void context.queryClient.prefetchQuery(featuresOptions);
    void context.queryClient.prefetchQuery(listDataOptions);

    const article = await context.queryClient.ensureQueryData(articleOptions);
    return {
      shell: shellFromArticle(article),
      bootstrap: article ? bootstrapFromCollectionDoc(article) : null,
    };
  },
  pendingComponent: CollectionPending,
  pendingMs: 0,
  head: ({ loaderData, match }) => {
    const baseUrl = getPublicUrlClient();
    const theme = loaderData?.shell?.theme;
    return {
      meta: siteSocialMeta({
        title: "The Standard Issue · Standard Reader",
        description: "Read a collection edition on Standard Reader.",
        url: `${baseUrl}${match.pathname}`,
      }),
      links: magazineThemeFontHeadLinks(theme),
    };
  },
  component: CollectionRoute,
});

function CollectionRoute() {
  const { did, rkey } = Route.useParams();
  const { ids } = Route.useSearch();
  const { shell, bootstrap } = Route.useLoaderData();
  const isClient = globalThis.window !== undefined;
  const isListMode = shell?.isCollection === false;

  const { data: listData, isPending: listPending } = useQuery({
    ...getMagazineDataQueryOptions({ did, rkey }, { ids }),
    enabled: isClient && isListMode,
  });

  const { data: features, isPending: featuresPending } = useQuery({
    ...getMagazineCollectionFeaturesQueryOptions({ did, rkey }),
    enabled: isClient && !isListMode && bootstrap != null,
  });

  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { openInMagazine } = useOpenCollectionsInMagazine();

  const issue = useMemo(() => {
    if (isListMode) {
      if (!listData || listData.mode !== "list") return null;
      return composeIssue(
        listData.name,
        listData.ownerHandle,
        listData.articles,
      );
    }
    if (!bootstrap) return null;
    return composeCollectionIssue({
      ...bootstrap,
      features: features ?? [],
    });
  }, [bootstrap, features, isListMode, listData]);

  if (!isClient || !shell) {
    return <CollectionPendingView shell={shell} />;
  }

  if (isListMode) {
    if (listPending || !issue) {
      return <CollectionPendingView shell={shell} />;
    }
  } else if (!bootstrap) {
    return <CollectionPendingView shell={shell} />;
  }

  if (!issue) {
    return <CollectionPendingView shell={shell} />;
  }

  if (!isListMode && featuresPending) {
    return <CollectionPendingView shell={shell} />;
  }

  if (issue.features.length === 0) {
    return (
      <MagazineShell theme={issue.theme ?? null}>
        <div className="building">
          <div>
            <div style={{ marginBottom: 12 }}>Nothing to read here yet.</div>
            <button
              className="toc-btn show"
              style={{ position: "static" }}
              onClick={() => {
                exitMagazineViewer({
                  history: router.history,
                  canGoBack,
                  openInMagazine,
                  mode: isListMode ? "list" : "collection",
                  did,
                  rkey,
                  publicationParams: bootstrap?.publicationParams ?? null,
                  onNavigate: (target) => {
                    void navigate(target);
                  },
                });
              }}
            >
              Go back
            </button>
          </div>
        </div>
      </MagazineShell>
    );
  }

  const openReader = () => {
    if (!isListMode) {
      void navigate({
        to: "/a/$did/$rkey",
        params: { did, rkey },
        search: collectionReaderViewSearch,
      });
    } else {
      void navigate({ to: "/l/$did/$rkey", params: { did, rkey } });
    }
  };

  const closeViewer = () => {
    exitMagazineViewer({
      history: router.history,
      canGoBack,
      openInMagazine,
      mode: isListMode ? "list" : "collection",
      did,
      rkey,
      publicationParams: bootstrap?.publicationParams ?? null,
      onNavigate: (target) => {
        void navigate(target);
      },
    });
  };

  return (
    <Magazine issue={issue} onExit={closeViewer} onOpenReader={openReader} />
  );
}
