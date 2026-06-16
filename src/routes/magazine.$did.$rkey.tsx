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

import { composeCollectionIssue, composeIssue } from "../magazine/compose";
import { loadMagazineData } from "../magazine/load-magazine-data";
import { Magazine } from "../magazine/Magazine";
import "../magazine/magazine.css";

const magazineSearchSchema = z.object({
  // `did~rkey,…` — when present, pins the edition to exactly these articles so a
  // shared link keeps showing the same issue even as the list gains new posts.
  ids: z.string().optional(),
});

function MagazinePending() {
  return (
    <div className="mag" aria-busy="true" aria-label="Loading magazine">
      <div className="building">
        <div>
          <div className="spin" />
          Opening the issue…
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/magazine/$did/$rkey")({
  validateSearch: magazineSearchSchema,
  loaderDeps: ({ search }) => ({ ids: search.ids }),
  pendingMs: 150,
  pendingComponent: MagazinePending,
  loader: ({ context, params, deps }) =>
    loadMagazineData(context.queryClient, params, deps),
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
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { openInMagazine } = useOpenCollectionsInMagazine();

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

  const openReader = () => {
    if (data.mode === "collection") {
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
      mode: data.mode,
      did,
      rkey,
      publicationParams:
        data.mode === "collection" ? data.publicationParams : null,
      onNavigate: (target) => {
        void navigate(target);
      },
    });
  };

  if (issue.features.length === 0) {
    return (
      <div className="mag">
        <div className="building">
          <div>
            <div style={{ marginBottom: 12 }}>Nothing to read here yet.</div>
            <button
              className="toc-btn show"
              style={{ position: "static" }}
              onClick={closeViewer}
            >
              Go back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Magazine issue={issue} onExit={closeViewer} onOpenReader={openReader} />
  );
}
