import Cookies from "universal-cookie";

export const SAVED_HANDLES_COOKIE_NAME = "saved-handles:v1";

export interface SavedHandle {
  handle: string;
  avatar: string | null;
  lastUsed: number;
}

/** Keep cookie under ~4KB browser limits when many avatars are CDN URLs */
const SAVED_HANDLE_AVATAR_MAX_CHARS = 900;

function truncateAvatarForCookie(avatar: string | null): string | null {
  if (avatar === null) {
    return null;
  }
  if (avatar.length <= SAVED_HANDLE_AVATAR_MAX_CHARS) {
    return avatar;
  }
  return avatar.slice(0, SAVED_HANDLE_AVATAR_MAX_CHARS);
}

function normalizeSavedHandlesCookie(raw: unknown): Array<SavedHandle> {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw as Array<SavedHandle>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as Array<SavedHandle>) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function getSavedHandles(
  cookieHeader?: string | null,
): Array<SavedHandle> {
  try {
    const cookies = new Cookies(cookieHeader || undefined);
    const cookieValue = cookies.get(SAVED_HANDLES_COOKIE_NAME);
    return normalizeSavedHandlesCookie(cookieValue);
  } catch (error) {
    console.error({ error });
    return [];
  }
}

export function saveHandle(handle: string, avatar: string | null): void {
  if (globalThis.window === undefined) {
    return;
  }

  try {
    const saved = getSavedHandles();
    const filtered = saved.filter((h) => h.handle !== handle);
    const storedAvatar = truncateAvatarForCookie(avatar);
    const updated = [
      { handle, avatar: storedAvatar, lastUsed: Date.now() },
      ...filtered,
    ]
      .toSorted((a: SavedHandle, b: SavedHandle) => b.lastUsed - a.lastUsed)
      .slice(0, 5);

    const cookies = new Cookies();
    const maxAge = 365 * 24 * 60 * 60;
    const isSecure = globalThis.location.protocol === "https:";

    cookies.set(SAVED_HANDLES_COOKIE_NAME, updated, {
      path: "/",
      sameSite: "lax",
      secure: isSecure,
      maxAge,
    });
  } catch {
    // Cookies might be unavailable
  }
}
