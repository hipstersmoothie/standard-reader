import type {
  ExtensionDiscussionResponse,
  ExtensionNarrationResponse,
  ExtensionResolveResult,
  ExtensionSessionResponse,
} from "./types";

import { AUTH_SESSION_COOKIE, getEffectiveApiOrigin } from "./config";
import { readSessionCookieValue } from "./session-cookie";

async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const origin = await getEffectiveApiOrigin();
  const sessionToken = await readSessionCookieValue(origin);

  const headers = new Headers(init.headers);
  if (sessionToken) {
    headers.set("Cookie", `${AUTH_SESSION_COOKIE}=${sessionToken}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${origin}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
}

export async function fetchSession(): Promise<ExtensionSessionResponse> {
  const response = await apiFetch("/api/extension/session");
  if (!response.ok) {
    // Treat unreachable API as signed-out (wrong port, dev server down).
    return {
      signedIn: false,
      handle: null,
      name: null,
      image: null,
      did: null,
    };
  }
  return (await response.json()) as ExtensionSessionResponse;
}

export async function fetchResolve(
  url: string,
  hints?: { documentUri?: string | null; publicationUri?: string | null },
): Promise<ExtensionResolveResult> {
  const params = new URLSearchParams({ url });
  if (hints?.documentUri) {
    params.set("documentUri", hints.documentUri);
  }
  if (hints?.publicationUri) {
    params.set("publicationUri", hints.publicationUri);
  }
  const response = await apiFetch(
    `/api/extension/resolve?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error("Failed to resolve URL");
  }
  return (await response.json()) as ExtensionResolveResult;
}

export async function fetchResolveBatch(
  urls: Array<string>,
): Promise<Record<string, ExtensionResolveResult>> {
  const response = await apiFetch(
    `/api/extension/resolve?urls=${encodeURIComponent(urls.join(","))}`,
  );
  if (!response.ok) {
    throw new Error("Failed to resolve URLs");
  }
  const body = (await response.json()) as {
    results: Record<string, ExtensionResolveResult>;
  };
  return body.results;
}

export async function fetchNarration(
  documentUri: string,
): Promise<ExtensionNarrationResponse> {
  const response = await apiFetch(
    `/api/extension/narration?documentUri=${encodeURIComponent(documentUri)}`,
  );
  if (response.status === 404) {
    throw new Error("This article has nothing to read aloud.");
  }
  if (!response.ok) {
    throw new Error("Couldn’t load the article narration.");
  }
  return (await response.json()) as ExtensionNarrationResponse;
}

export async function fetchBookmark(
  documentUri: string,
  save: boolean,
): Promise<void> {
  const response = save
    ? await apiFetch("/api/extension/bookmark", {
        method: "POST",
        body: JSON.stringify({ documentUri }),
      })
    : await apiFetch(
        `/api/extension/bookmark?documentUri=${encodeURIComponent(documentUri)}`,
        { method: "DELETE" },
      );

  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error("Bookmark failed");
  }
}

export async function fetchFollow(
  publicationUri: string,
  follow: boolean,
): Promise<void> {
  const response = follow
    ? await apiFetch("/api/extension/follow", {
        method: "POST",
        body: JSON.stringify({ publicationUri }),
      })
    : await apiFetch(
        `/api/extension/follow?publicationUri=${encodeURIComponent(publicationUri)}`,
        { method: "DELETE" },
      );

  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error("Subscribe failed");
  }
}

export async function fetchRecommend(
  documentUri: string,
  recommend: boolean,
): Promise<void> {
  const response = recommend
    ? await apiFetch("/api/extension/recommend", {
        method: "POST",
        body: JSON.stringify({ documentUri }),
      })
    : await apiFetch(
        `/api/extension/recommend?documentUri=${encodeURIComponent(documentUri)}`,
        { method: "DELETE" },
      );

  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error("Like failed");
  }
}

function normalizeDiscussionResponse(
  body: unknown,
): ExtensionDiscussionResponse {
  const raw = body as Partial<
    ExtensionDiscussionResponse & {
      comments?: ExtensionDiscussionResponse["discussions"];
      related?: ExtensionDiscussionResponse["relatedReading"];
      mentions?: ExtensionDiscussionResponse["citedIn"];
    }
  >;

  return {
    keepReading: raw.keepReading ?? [],
    discussions: raw.discussions ?? raw.comments ?? [],
    relatedReading: raw.relatedReading ?? raw.related ?? [],
    citedIn: raw.citedIn ?? raw.mentions ?? [],
  };
}

export async function fetchDiscussion(
  documentUri: string,
): Promise<ExtensionDiscussionResponse> {
  const origin = await getEffectiveApiOrigin();
  const response = await apiFetch(
    `/api/extension/discussion?documentUri=${encodeURIComponent(documentUri)}`,
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Discussion isn’t available on ${origin} yet. Use a local dev server or deploy the latest app.`,
      );
    }
    throw new Error("Couldn’t load discussion.");
  }

  try {
    return normalizeDiscussionResponse(await response.json());
  } catch {
    throw new Error("Couldn’t load discussion.");
  }
}
