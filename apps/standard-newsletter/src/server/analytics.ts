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

/* ── Connecting publications ─────────────────────────────────────────────── */

export interface ConnectablePublicationData {
  uri: string;
  id: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  iconUrl: string | null;
  followers: number;
  posts: number;
}

/** The signed-in author's publications that are not newsletters yet. */
export const getConnectablePublications = createServerFn({
  method: "GET",
}).handler(async (): Promise<Array<ConnectablePublicationData>> => {
  const [{ loadConnectablePublications }, { getCurrentUserDid }] =
    await Promise.all([
      import("./newsletters.server"),
      import("../integrations/auth/session.server"),
    ]);
  const did = await getCurrentUserDid(getRequest());
  if (!did) return [];
  return await loadConnectablePublications(did);
});

export function connectablePublicationsQueryOptions() {
  return queryOptions({
    queryKey: ["publications", "connectable"],
    queryFn: () => getConnectablePublications(),
    staleTime: 30_000,
  });
}

/**
 * Opt a publication in to being mailed. Ownership is re-checked server-side
 * against the publication's current owner — the URI from the client is a
 * request, not a claim.
 */
export const connectPublicationFn = createServerFn({ method: "POST" })
  .validator((data: { publicationUri: string }) => data)
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    const [{ connectPublication }, { getCurrentUserDid }] = await Promise.all([
      import("./newsletters.server"),
      import("../integrations/auth/session.server"),
    ]);
    const did = await getCurrentUserDid(getRequest());
    if (!did) return { ok: false, reason: "not-signed-in" };
    const outcome = await connectPublication(did, data.publicationUri);
    return outcome === "not-owner"
      ? { ok: false, reason: outcome }
      : { ok: true };
  });

/** Stop mailing a publication. Subscribers and past sends are kept. */
export const disconnectPublicationFn = createServerFn({ method: "POST" })
  .validator((data: { publicationUri: string }) => data)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const [{ disconnectPublication }, { getCurrentUserDid }] =
      await Promise.all([
        import("./newsletters.server"),
        import("../integrations/auth/session.server"),
      ]);
    const did = await getCurrentUserDid(getRequest());
    if (!did) return { ok: false };
    return { ok: await disconnectPublication(did, data.publicationUri) };
  });

/**
 * Set a newsletter's From identity. Empty strings clear a field back to the
 * instance default. Ownership + address shape are validated server-side.
 */
export const updateSenderFn = createServerFn({ method: "POST" })
  .validator(
    (data: { publicationUri: string; fromName: string; fromAddress: string }) =>
      data,
  )
  .handler(async ({ data }): Promise<{ ok: boolean; reason?: string }> => {
    const [{ updateSender }, { getCurrentUserDid }] = await Promise.all([
      import("./newsletters.server"),
      import("../integrations/auth/session.server"),
    ]);
    const did = await getCurrentUserDid(getRequest());
    if (!did) return { ok: false, reason: "not-signed-in" };
    const outcome = await updateSender(
      did,
      data.publicationUri,
      data.fromName,
      data.fromAddress,
    );
    return outcome === "updated"
      ? { ok: true }
      : { ok: false, reason: outcome };
  });

/** Instance-default sender identity, shown as placeholders in the sender form. */
export interface SenderDefaults {
  fromName: string;
  fromAddress: string;
}

export const getSenderDefaults = createServerFn({ method: "GET" }).handler(
  async (): Promise<SenderDefaults> => {
    const { emailConfig } = await import("./email/config");
    return {
      fromName: emailConfig.defaultFromName,
      fromAddress: emailConfig.defaultFrom,
    };
  },
);

export function senderDefaultsQueryOptions() {
  return queryOptions({
    queryKey: ["sender-defaults"],
    queryFn: () => getSenderDefaults(),
    staleTime: Infinity,
  });
}

/* ── Subscriber list ─────────────────────────────────────────────────────── */

export interface SubscriberRowData {
  email: string;
  did: string | null;
  status: "confirmed" | "pending" | "unsubscribed";
  source: string;
  joinedMs: number;
  joined: string;
  openRate: number | null;
}

export interface PublicationSubscribersData {
  name: string;
  confirmed: number;
  subscribers: Array<SubscriberRowData>;
}

/**
 * The subscriber list behind a publication's Subscribers count. Owner-scoped:
 * returns null unless the signed-in user owns and has connected the publication,
 * since this is the author's private email list.
 */
export const getPublicationSubscribers = createServerFn({ method: "GET" })
  .validator((data: { pubId: string }) => data)
  .handler(async ({ data }): Promise<PublicationSubscribersData | null> => {
    const [{ loadPublicationSubscribers }, { getCurrentUserDid }] =
      await Promise.all([
        import("./newsletters.server"),
        import("../integrations/auth/session.server"),
      ]);
    const did = await getCurrentUserDid(getRequest());
    if (!did) return null;
    return await loadPublicationSubscribers(did, data.pubId);
  });

export function publicationSubscribersQueryOptions(pubId: string) {
  return queryOptions({
    queryKey: ["publications", "subscribers", pubId],
    queryFn: () => getPublicationSubscribers({ data: { pubId } }),
    staleTime: 30_000,
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
