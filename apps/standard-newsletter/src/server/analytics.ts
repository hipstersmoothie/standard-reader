/**
 * Analytics data access. `getPublications` runs on the server: it resolves the
 * signed-in user's DID and reads *their* publications from the shared reader DB
 * via `analytics.server`. Falls back to sample data when no DB is configured or
 * the query fails — so the app runs in dev/demo without credentials.
 *
 * When signed in, the list is scoped to the user's own publications
 * (publications.did == their DID). When not signed in but a DB is present (e.g.
 * the public marketing home), it shows the top publications as social proof.
 */

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import type { Publication } from "../data/publications";
import { PUBS } from "../data/publications";

export const getPublications = createServerFn({ method: "GET" }).handler(
  async (): Promise<Publication[]> => {
    try {
      const [{ loadPublicationsFromDb }, { getCurrentUserDid }] =
        await Promise.all([
          import("./analytics.server"),
          import("../integrations/auth/session.server"),
        ]);
      const did = await getCurrentUserDid(getRequest());
      const rows = await loadPublicationsFromDb(did);
      if (rows) return rows;
    } catch (error) {
      console.error(
        "[standard-newsletter] DB unavailable, using sample data:",
        error,
      );
    }
    return PUBS;
  },
);

export function publicationsQueryOptions() {
  return queryOptions({
    queryKey: ["publications"],
    queryFn: () => getPublications(),
    staleTime: 60_000,
  });
}

export interface ViewerData {
  did: string;
  displayName: string;
  handle: string | null;
  image: string | null;
}

export const getViewer = createServerFn({ method: "GET" }).handler(
  async (): Promise<ViewerData | null> => {
    try {
      const { getCurrentViewer } = await import(
        "../integrations/auth/session.server"
      );
      return await getCurrentViewer(getRequest());
    } catch {
      return null;
    }
  },
);

export function viewerQueryOptions() {
  return queryOptions({
    queryKey: ["viewer"],
    queryFn: () => getViewer(),
    staleTime: 60_000,
  });
}

/**
 * App access mode for the authenticated shell:
 * - `demo`  — no DATABASE_URL, run on sample data without auth.
 * - `authed` — signed in; scope to the user's publications.
 * - `login` — DB configured but not signed in; redirect to /login.
 */
export const getAppAccess = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ mode: "demo" | "authed" | "login"; viewer: ViewerData | null }> => {
    if (!process.env.DATABASE_URL) return { mode: "demo", viewer: null };
    try {
      const { getCurrentViewer } = await import(
        "../integrations/auth/session.server"
      );
      const viewer = await getCurrentViewer(getRequest());
      return viewer
        ? { mode: "authed", viewer }
        : { mode: "login", viewer: null };
    } catch {
      return { mode: "demo", viewer: null };
    }
  },
);
