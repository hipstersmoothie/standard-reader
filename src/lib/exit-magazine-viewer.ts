import type { RouterHistory } from "@tanstack/react-router";

import { collectionReaderPath } from "./open-collections-in-magazine";

type HistoryStack = Pick<RouterHistory, "back" | "go"> & {
  index?: number;
  entries?: Array<{ pathname?: string }>;
};

export type MagazineExitTarget =
  | { to: "/a/$did/$rkey"; params: { did: string; rkey: string } }
  | { to: "/p/$did/$rkey"; params: { did: string; rkey: string } }
  | { to: "/l/$did/$rkey"; params: { did: string; rkey: string } };

/** Leave the magazine viewer with context-aware navigation. */
export function exitMagazineViewer({
  history,
  canGoBack,
  openInMagazine,
  mode,
  did,
  rkey,
  publicationParams,
  onNavigate,
}: {
  history: HistoryStack;
  canGoBack: boolean;
  openInMagazine: boolean;
  mode: "collection" | "list";
  did: string;
  rkey: string;
  publicationParams: { did: string; rkey: string } | null;
  onNavigate: (target: MagazineExitTarget) => void;
}): void {
  if (mode === "collection") {
    if (!canGoBack) {
      if (publicationParams) {
        onNavigate({ to: "/p/$did/$rkey", params: publicationParams });
      } else {
        onNavigate({ to: "/a/$did/$rkey", params: { did, rkey } });
      }
      return;
    }

    if (openInMagazine) {
      const prev = history.entries?.[(history.index ?? 0) - 1];
      if (prev?.pathname === collectionReaderPath(did, rkey)) {
        history.go(-2);
        return;
      }
      history.back();
      return;
    }

    onNavigate({ to: "/a/$did/$rkey", params: { did, rkey } });
    return;
  }

  if (canGoBack) {
    history.back();
    return;
  }

  onNavigate({ to: "/l/$did/$rkey", params: { did, rkey } });
}
