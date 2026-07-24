/**
 * Analytics data access. `getPublications` runs on the server: it resolves the
 * signed-in user's DID and reads *their* publications from the shared reader DB
 * via `analytics.server`.
 *
 * Everything here is real data or an error — there is no sample/demo fallback.
 * A DB failure surfaces rather than masquerading as plausible-looking numbers.
 *
 * When signed in, the list is scoped to the user's own publications
 * (publications.did == their DID). When not signed in (the public marketing
 * home), it shows the top publications as social proof.
 */

import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import type { Publication } from "../data/publications";

const NO_DB =
  "[standard-newsletter] DATABASE_URL is not configured — the app reads all of its data from the Standard Reader database.";

export const getPublications = createServerFn({ method: "GET" }).handler(
  async (): Promise<Array<Publication>> => {
    const [{ loadPublicationsFromDb }, { getCurrentUserDid }] =
      await Promise.all([
        import("./analytics.server"),
        import("../integrations/auth/session.server"),
      ]);
    const did = await getCurrentUserDid(getRequest());
    const rows = await loadPublicationsFromDb(did);
    if (!rows) throw new Error(NO_DB);
    return rows;
  },
);

export function publicationsQueryOptions() {
  return queryOptions({
    queryKey: ["publications"],
    queryFn: () => getPublications(),
    staleTime: 60_000,
  });
}

/**
 * Top publications for the public marketing home, as social proof.
 *
 * Deliberately lenient where {@link getPublications} is strict: the rail is
 * decoration on a page anyone can reach, so a missing DB degrades it to empty
 * rather than 500-ing the front door. It still never invents publications —
 * empty means empty.
 */
export const getShowcasePublications = createServerFn({
  method: "GET",
}).handler(async (): Promise<Array<Publication>> => {
  try {
    const { loadPublicationsFromDb } = await import("./analytics.server");
    return (await loadPublicationsFromDb()) ?? [];
  } catch (error) {
    console.error("[standard-newsletter] showcase publications failed:", error);
    return [];
  }
});

export function showcasePublicationsQueryOptions() {
  return queryOptions({
    queryKey: ["publications", "showcase"],
    queryFn: () => getShowcasePublications(),
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
      const { getCurrentViewer } =
        await import("../integrations/auth/session.server");
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
  .handler(async ({ data }): Promise<PublicationSummaryData | null> => {
    if (!process.env.DATABASE_URL) throw new Error(NO_DB);
    const { loadPublicationSummary } = await import("./analytics.server");
    return await loadPublicationSummary(data.pubId);
  });

/**
 * App access mode for the authenticated shell:
 * - `authed` — signed in; scope to the user's publications.
 * - `login` — not signed in; redirect to /login.
 *
 * There is no unauthenticated mode. The shell shows one person's real
 * publications and delivery numbers, so it needs a viewer to scope to.
 */
export const getAppAccess = createServerFn({ method: "GET" }).handler(
  async (): Promise<
    { mode: "authed"; viewer: ViewerData } | { mode: "login"; viewer: null }
  > => {
    try {
      const { getCurrentViewer } =
        await import("../integrations/auth/session.server");
      const viewer = await getCurrentViewer(getRequest());
      return viewer
        ? { mode: "authed", viewer }
        : { mode: "login", viewer: null };
    } catch {
      return { mode: "login", viewer: null };
    }
  },
);
