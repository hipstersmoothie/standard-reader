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

export interface SettingsData {
  viewer: ViewerData | null;
  sending: {
    fromName: string;
    fromAddress: string;
    publicUrl: string;
    resendConfigured: boolean;
  };
}

export const getSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<SettingsData> => {
    const [{ getCurrentViewer }, { emailConfig }] = await Promise.all([
      import("../integrations/auth/session.server"),
      import("./email/config"),
    ]);
    let viewer: ViewerData | null = null;
    try {
      viewer = await getCurrentViewer(getRequest());
    } catch {
      viewer = null;
    }
    return {
      viewer,
      sending: {
        fromName: emailConfig.defaultFromName,
        fromAddress: emailConfig.defaultFrom,
        publicUrl: emailConfig.publicUrl,
        resendConfigured: Boolean(process.env.RESEND_API_KEY),
      },
    };
  },
);

export function settingsQueryOptions() {
  return queryOptions({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
    staleTime: 60_000,
  });
}

export interface PublicationSummaryData {
  uri: string;
  id: string;
  name: string;
  description: string;
  theme: {
    background: string;
    foreground: string;
    accent: string;
    accentForeground: string;
  };
}

export const getPublicationSummary = createServerFn({ method: "GET" })
  .validator((data: { pubId: string }) => data)
  .handler(
    async ({ data }): Promise<PublicationSummaryData | null> => {
      try {
        const { loadPublicationSummary } = await import("./analytics.server");
        const row = await loadPublicationSummary(data.pubId);
        if (row) return row;
        if (process.env.DATABASE_URL) return null;
      } catch (error) {
        console.error("[standard-newsletter] publication summary failed:", error);
      }
      const p = PUBS.find((x) => x.id === data.pubId);
      return p
        ? {
            uri: `sample:${p.id}`,
            id: p.id,
            name: p.name,
            description: p.desc,
            theme: p.theme,
          }
        : null;
    },
  );

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
