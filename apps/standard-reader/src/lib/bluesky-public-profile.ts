/**
 * Profile fields from public.api.bsky.app (stable JSON for login flows).
 */

import { viewDeclaresBot } from "./self-labels.ts";

export type BlueskyPublicProfileFields = {
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  /** The account self-declares as a bot (a `bot` self-label on its profile). */
  isBot: boolean;
};

function normalizeProfileResponse(raw: unknown): BlueskyPublicProfileFields {
  const profileData = raw as {
    did?: string | null;
    handle?: string | null;
    displayName?: string | null;
    avatar?: string | null;
    labels?: unknown;
  };
  const handle = profileData.handle?.trim();
  const displayName = profileData.displayName?.trim();
  const rawAvatar = profileData.avatar;
  const avatarUrl =
    typeof rawAvatar === "string" && rawAvatar.trim() !== ""
      ? rawAvatar.trim()
      : null;
  return {
    // `handle.invalid` is the AT Protocol sentinel for a handle bsky couldn't
    // verify — not a usable handle. Drop it so it never surfaces as one.
    handle:
      handle && handle.length > 0 && handle !== "handle.invalid"
        ? handle
        : null,
    displayName: displayName && displayName.length > 0 ? displayName : null,
    avatarUrl,
    isBot:
      typeof profileData.did === "string"
        ? viewDeclaresBot(profileData.did, profileData.labels)
        : false,
  };
}

/**
 * Fetch handle, display name, and avatar URL for a DID via public Bluesky API.
 */
export async function fetchBlueskyPublicProfileFields(
  did: string,
): Promise<BlueskyPublicProfileFields | null> {
  try {
    const url = new URL(
      "xrpc/app.bsky.actor.getProfile",
      "https://public.api.bsky.app",
    );
    url.searchParams.set("actor", did);
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return normalizeProfileResponse(await response.json());
  } catch {
    return null;
  }
}

/** Max actors per `getProfiles` call — the AppView caps the `actors` array at 25. */
const GET_PROFILES_BATCH = 25;

/**
 * Batched {@link fetchBlueskyPublicProfileFields}: handle, display name, and
 * avatar for many DIDs at once, keyed by DID.
 *
 * For accounts we hold no `profiles` row for. A labeler can label any account
 * on the network, most of which never publish to standard.site and so are never
 * mirrored into the read-model — without this they render as a bare
 * `did:plc:…`. Best-effort: a failed batch yields no entries rather than
 * throwing, and the caller falls back to the DID.
 *
 * Results are keyed by the DID the AppView echoes back, not by input position:
 * deactivated and deleted accounts are simply omitted from the response, so
 * zipping against the request array would misalign every profile after the
 * first missing one.
 */
export async function fetchBlueskyPublicProfiles(
  dids: Array<string>,
): Promise<Map<string, BlueskyPublicProfileFields>> {
  const out = new Map<string, BlueskyPublicProfileFields>();
  const unique = [...new Set(dids)];
  if (unique.length === 0) return out;

  const batches: Array<Array<string>> = [];
  for (let i = 0; i < unique.length; i += GET_PROFILES_BATCH) {
    batches.push(unique.slice(i, i + GET_PROFILES_BATCH));
  }

  await Promise.all(
    batches.map(async (batch) => {
      try {
        const url = new URL(
          "xrpc/app.bsky.actor.getProfiles",
          "https://public.api.bsky.app",
        );
        for (const did of batch) url.searchParams.append("actors", did);
        const response = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return;
        const body = (await response.json()) as {
          profiles?: Array<{ did?: string }>;
        };
        for (const profile of body.profiles ?? []) {
          if (typeof profile.did === "string") {
            out.set(profile.did, normalizeProfileResponse(profile));
          }
        }
      } catch {
        // Best-effort enrichment — leave these DIDs unhydrated.
      }
    }),
  );
  return out;
}

/**
 * Whether to set `user.image` from Bluesky's public avatar URL.
 */
export function shouldApplyBlueskyAvatarFromPublicUrl(
  currentImage: string | null | undefined,
  blueskyAvatarUrl: string | null | undefined,
): boolean {
  if (!blueskyAvatarUrl || blueskyAvatarUrl.trim() === "") return false;
  const cur = currentImage?.trim() ?? "";
  if (cur === "") return true;
  if (cur.startsWith("data:image/")) return false;
  if (cur.startsWith("blob:")) return true;
  return false;
}
