/**
 * Hydrate the AT Protocol records a Bluesky web client URL can address —
 * profiles, feed generators, lists, and starter packs — via the public AppView
 * (no auth required). Used to turn a link to `bsky.app` or one of its forks
 * (Witchsky, mu.social, …) into a native embed instead of a bare link card.
 */

import type { BskyClientRef } from "#/lib/atproto/bsky-clients";
import { bskyClientRefAtUri } from "#/lib/atproto/bsky-clients";

const PUBLIC_APPVIEW = "https://public.api.bsky.app";
const FETCH_TIMEOUT_MS = 8000;

/** The record kinds that render as an entity card (posts have their own embed). */
export type BskyEntityKind = "profile" | "feed" | "list" | "starterPack";

export interface BskyEntityCard {
  kind: BskyEntityKind;
  /** `at://` URI of the record — or the DID, for a profile. */
  uri: string;
  /** In-app destination for a profile card; null for the other kinds. */
  did: string | null;
  title: string;
  description: string | null;
  avatarUrl: string | null;
  /** Owner of the record. Null on a profile card — the card *is* the owner. */
  creatorHandle: string | null;
  creatorDisplayName: string | null;
  /**
   * Followers for a profile, likes for a feed, members for a list, joins for a
   * starter pack — the component labels it by `kind`.
   */
  count: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function appview(
  method: string,
  params: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  try {
    const url = new URL(`/xrpc/${method}`, PUBLIC_APPVIEW);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

/** Creator fields shared by feed / list / starter pack views. */
function creatorOf(value: unknown): {
  creatorHandle: string | null;
  creatorDisplayName: string | null;
} {
  const creator = isRecord(value) ? value : null;
  return {
    creatorDisplayName: str(creator?.displayName),
    creatorHandle: str(creator?.handle),
  };
}

async function fetchProfile(ident: string): Promise<BskyEntityCard | null> {
  const body = await appview("app.bsky.actor.getProfile", { actor: ident });
  const did = str(body?.did);
  if (!did) return null;
  const handle = str(body?.handle);
  return {
    avatarUrl: str(body?.avatar),
    count: num(body?.followersCount),
    creatorDisplayName: null,
    creatorHandle: null,
    description: str(body?.description),
    did,
    kind: "profile",
    title: str(body?.displayName) ?? (handle ? `@${handle}` : did),
    uri: did,
  };
}

async function fetchFeedGenerator(
  atUri: string,
): Promise<BskyEntityCard | null> {
  const body = await appview("app.bsky.feed.getFeedGenerator", {
    feed: atUri,
  });
  const view = isRecord(body?.view) ? body.view : null;
  const title = str(view?.displayName);
  if (!view || !title) return null;
  return {
    ...creatorOf(view.creator),
    avatarUrl: str(view.avatar),
    count: num(view.likeCount),
    description: str(view.description),
    did: null,
    kind: "feed",
    title,
    uri: str(view.uri) ?? atUri,
  };
}

async function fetchList(atUri: string): Promise<BskyEntityCard | null> {
  const body = await appview("app.bsky.graph.getList", {
    limit: "1",
    list: atUri,
  });
  const view = isRecord(body?.list) ? body.list : null;
  const title = str(view?.name);
  if (!view || !title) return null;
  return {
    ...creatorOf(view.creator),
    avatarUrl: str(view.avatar),
    count: num(view.listItemCount),
    description: str(view.description),
    did: null,
    kind: "list",
    title,
    uri: str(view.uri) ?? atUri,
  };
}

async function fetchStarterPack(atUri: string): Promise<BskyEntityCard | null> {
  const body = await appview("app.bsky.graph.getStarterPack", {
    starterPack: atUri,
  });
  const view = isRecord(body?.starterPack) ? body.starterPack : null;
  const record = isRecord(view?.record) ? view.record : null;
  const title = str(record?.name);
  if (!view || !title) return null;
  return {
    ...creatorOf(view.creator),
    // Starter packs carry no avatar of their own — the creator's stands in.
    avatarUrl: str(isRecord(view.creator) ? view.creator.avatar : null),
    count: num(view.joinedAllTimeCount),
    description: str(record?.description),
    did: null,
    kind: "starterPack",
    title,
    uri: str(view.uri) ?? atUri,
  };
}

async function resolveHandle(handle: string): Promise<string | null> {
  const body = await appview("com.atproto.identity.resolveHandle", { handle });
  const did = str(body?.did);
  return did?.startsWith("did:") ? did : null;
}

/**
 * Hydrate the record a Bluesky client link addresses. Returns null when the
 * record can't be resolved (deleted, blocked, or the AppView is down) so the
 * caller can fall back to a plain link card. Posts are not handled here — they
 * render through the existing Bluesky post embed.
 */
export async function getBskyEntityCard(
  ref: BskyClientRef,
): Promise<BskyEntityCard | null> {
  if (ref.kind === "post") return null;
  if (ref.kind === "profile") return fetchProfile(ref.ident);

  // Every other kind is addressed by AT-URI, which needs a DID.
  let ident = ref.ident;
  if (!ident.startsWith("did:")) {
    const did = await resolveHandle(ident.toLowerCase());
    if (!did) return null;
    ident = did;
  }
  const atUri = bskyClientRefAtUri({ ...ref, ident });
  if (!atUri) return null;

  switch (ref.kind) {
    case "feed": {
      return fetchFeedGenerator(atUri);
    }
    case "list": {
      return fetchList(atUri);
    }
    case "starterPack": {
      return fetchStarterPack(atUri);
    }
  }
}
