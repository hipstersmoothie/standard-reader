/**
 * Profile fields from public.api.bsky.app (stable JSON for login flows).
 */
export type BlueskyPublicProfileFields = {
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

function normalizeProfileResponse(raw: unknown): BlueskyPublicProfileFields {
  const profileData = raw as {
    handle?: string | null;
    displayName?: string | null;
    avatar?: string | null;
  };
  const handle = profileData.handle?.trim();
  const displayName = profileData.displayName?.trim();
  const rawAvatar = profileData.avatar;
  const avatarUrl =
    typeof rawAvatar === "string" && rawAvatar.trim() !== ""
      ? rawAvatar.trim()
      : null;
  return {
    handle: handle && handle.length > 0 ? handle : null,
    displayName: displayName && displayName.length > 0 ? displayName : null,
    avatarUrl,
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
