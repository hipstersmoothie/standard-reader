"use client";

import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  useCanGoBack,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useCallback, useMemo, useState } from "react";
import { z } from "zod";

import type { CollectionMagazineData } from "#/integrations/tanstack-query/api-publication.functions";
import { collectionOgDescription } from "#/lib/collections/og-meta";
import { exitMagazineViewer } from "#/lib/exit-magazine-viewer";
import { collectionReaderViewSearch } from "#/lib/open-collections-in-magazine";
import { getPublicUrlClient } from "#/lib/public-url";
import {
  SITE_NAME,
  collectionFeedUrl,
  collectionOgImageUrl,
  siteSocialMeta,
} from "#/lib/site-metadata";
import { useOpenCollectionsInMagazine } from "#/lib/use-open-collections-in-magazine";

import { documentUriFromParams } from "../components/reader/format";
import { publicationApi } from "../integrations/tanstack-query/api-publication.functions";
import { composeCollectionIssue, composeIssue } from "../magazine/compose";
import { readMagazineDark } from "../magazine/dark-mode";
import { magazineThemeFontHeadLinks } from "../magazine/font-preload";
import {
  bootstrapFromCollectionData,
  getCollectionMagazineQueryOptions,
  getMagazineDataQueryOptions,
  seedCollectionMagazineCaches,
  shellFromArticle,
  shellFromCollectionData,
} from "../magazine/load-magazine-data";
import { Magazine } from "../magazine/Magazine";
import {
  MagazineBuilding,
  MagazineShell,
  magazineRouteBackdropStyle,
} from "../magazine/magazine-shell";
import type { MagazineShellData } from "../magazine/types";

import "../magazine/magazine.css";

const collectionSearchSchema = z.object({
  // `did~rkey,…` — when present, pins the edition to exactly these articles so a
  // shared link keeps showing the same issue even as the list gains new posts.
  ids: z.string().optional(),
});

function collectionPendingLabel(shell: MagazineShellData | null | undefined) {
  return shell?.isCollection === false
    ? msg`Opening the issue…`
    : msg`Opening the collection…`;
}

export const Route = createFileRoute("/collection/$did/$rkey")({
  validateSearch: collectionSearchSchema,
  loaderDeps: ({ search }) => ({ ids: search.ids }),
  loader: async ({ context, params, preload, deps }) => {
    const uri = documentUriFromParams(params.did, params.rkey);
    const collectionOptions = getCollectionMagazineQueryOptions(params);
    const listDataOptions = getMagazineDataQueryOptions(params, deps);

    if (preload) {
      void context.queryClient.prefetchQuery(collectionOptions);
      void context.queryClient.prefetchQuery(listDataOptions);
      return {
        shell: null,
        isListMode: null as boolean | null,
        collection: null as CollectionMagazineData | null,
      };
    }

    const collection = await context.queryClient
      .ensureQueryData(collectionOptions)
      .catch(() => null);

    if (collection) {
      seedCollectionMagazineCaches(context.queryClient, collection);
      return {
        shell: shellFromCollectionData(collection),
        isListMode: false,
        collection,
      };
    }

    void context.queryClient.prefetchQuery(listDataOptions);

    const article = await context.queryClient.ensureQueryData(
      publicationApi.getArticleQueryOptions(uri),
    );
    return {
      shell: shellFromArticle(article),
      isListMode: !article?.collection,
      collection: null as CollectionMagazineData | null,
    };
  },
  head: ({ loaderData, match }) => {
    const baseUrl = getPublicUrlClient();
    const theme = loaderData?.shell?.theme;
    const backdrop = magazineRouteBackdropStyle(theme);
    const collection = loaderData?.collection;
    const publicationName = collection?.publicationName?.trim() || SITE_NAME;
    const pageTitle = collection
      ? `${collection.name} · ${publicationName}`
      : "The Standard Issue · Standard Reader";
    const description = collection
      ? collectionOgDescription({
          editorial: collection.editorial,
          description: collection.collectionDoc.description,
          featureCount: collection.features.length,
          publicationName: collection.publicationName,
        })
      : "Read a collection edition on Standard Reader.";

    return {
      meta: siteSocialMeta({
        title: pageTitle,
        description,
        url: `${baseUrl}${match.pathname}`,
        ogImage: collection
          ? collectionOgImageUrl(baseUrl, match.params.did, match.params.rkey)
          : undefined,
      }),
      links: [
        ...magazineThemeFontHeadLinks(theme),
        {
          rel: "alternate",
          type: "application/rss+xml",
          title: pageTitle,
          href: collectionFeedUrl(baseUrl, match.params.did, match.params.rkey),
        },
      ],
      styles: backdrop ? [backdrop] : [],
    };
  },
  component: CollectionRoute,
});

function CollectionRoute() {
  const { did, rkey } = Route.useParams();
  const { ids } = Route.useSearch();
  const {
    shell,
    isListMode: loaderIsListMode,
    collection: loaderCollection,
  } = Route.useLoaderData();

  return (
    <CollectionRouteView
      key={`${did}/${rkey}`}
      did={did}
      rkey={rkey}
      ids={ids}
      shell={shell}
      loaderIsListMode={loaderIsListMode}
      loaderCollection={loaderCollection}
    />
  );
}

function CollectionRouteView({
  did,
  rkey,
  ids,
  shell,
  loaderIsListMode,
  loaderCollection,
}: {
  did: string;
  rkey: string;
  ids?: string;
  shell: ReturnType<typeof Route.useLoaderData>["shell"];
  loaderIsListMode: boolean | null;
  loaderCollection: CollectionMagazineData | null;
}) {
  const { i18n } = useLingui();
  const isListMode = loaderIsListMode === true;

  const { data: collection = loaderCollection ?? undefined } = useQuery({
    ...getCollectionMagazineQueryOptions({ did, rkey }),
    enabled: !isListMode,
    initialData: loaderCollection ?? undefined,
  });

  const { data: listData, isPending: listPending } = useQuery({
    ...getMagazineDataQueryOptions({ did, rkey }, { ids }),
    enabled: isListMode,
  });

  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { openInMagazine } = useOpenCollectionsInMagazine();

  const theme = shell?.theme ?? collection?.theme ?? null;
  const themeDark = readMagazineDark(theme);
  const [darkOverride, setDarkOverride] = useState<boolean | null>(null);
  const dark = darkOverride ?? themeDark;

  const setDark = useCallback<Dispatch<SetStateAction<boolean>>>(
    (next) => {
      setDarkOverride((prev) => {
        const current = prev ?? themeDark;
        return typeof next === "function" ? next(current) : next;
      });
    },
    [themeDark],
  );

  const issue = useMemo(() => {
    if (isListMode) {
      if (!listData || listData.mode !== "list") return null;
      return composeIssue(
        listData.name,
        listData.ownerHandle,
        listData.articles,
        { did, rkey, listUri: listData.listUri },
      );
    }
    if (!collection) return null;
    return composeCollectionIssue({
      ...bootstrapFromCollectionData(collection),
      documentUri: collection.collectionDoc.uri,
      recommendCount: collection.collectionDoc.recommendCount,
      features: collection.features,
    });
  }, [collection, isListMode, listData, did, rkey]);

  const publicationParams = isListMode
    ? null
    : (collection?.publicationParams ?? null);

  const waitingForList = isListMode && (listPending || !issue);
  const waitingForCollection = !isListMode && !collection && !loaderCollection;

  const openReader = () => {
    if (isListMode) {
      void navigate({ to: "/l/$did/$rkey", params: { did, rkey } });
      return;
    }
    void navigate({
      to: "/a/$did/$rkey",
      params: { did, rkey },
      search: collectionReaderViewSearch,
    });
  };

  const closeViewer = () => {
    exitMagazineViewer({
      history: router.history,
      canGoBack,
      openInMagazine,
      mode: isListMode ? "list" : "collection",
      did,
      rkey,
      publicationParams,
      onNavigate: (target) => {
        void navigate(target);
      },
    });
  };

  let shellContent: ReactNode;
  if (!shell || waitingForList || waitingForCollection) {
    shellContent = (
      <MagazineBuilding label={i18n._(collectionPendingLabel(shell))} />
    );
  } else if (!issue || issue.features.length === 0) {
    shellContent = (
      <div className="building">
        <div>
          <div style={{ marginBottom: 12 }}>
            <Trans>Nothing to read here yet.</Trans>
          </div>
          <button
            className="toc-btn show"
            style={{ position: "static" }}
            onClick={closeViewer}
          >
            <Trans>Go back</Trans>
          </button>
        </div>
      </div>
    );
  } else {
    shellContent = (
      <Magazine
        embedded
        issue={issue}
        dark={dark}
        onDarkChange={setDark}
        onExit={closeViewer}
        onOpenReader={openReader}
      />
    );
  }

  return (
    <MagazineShell theme={theme} dark={dark}>
      {shellContent}
    </MagazineShell>
  );
}
