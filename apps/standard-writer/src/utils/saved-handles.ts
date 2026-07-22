import Cookies from "universal-cookie";

export const SAVED_HANDLES_COOKIE_NAME = "saved-handles:v1";

export interface SavedHandle {
  handle: string;
  avatar: string | null;
  lastUsed: number;
}

/** `@handle` for UI; strips a leading `@` if present. */
export function formatDisplayHandle(
  handle: string | null | undefined,
): string | null {
  const trimmed = handle?.trim().replace(/^@/, "");
  return trimmed ? `@${trimmed}` : null;
}

/** Keep the cookie under ~4KB browser limits when avatars are long CDN URLs. */
const SAVED_HANDLE_AVATAR_MAX_CHARS = 900;

function truncateAvatarForCookie(avatar: string | null): string | null {
  if (avatar === null) return null;
  if (avatar.length <= SAVED_HANDLE_AVATAR_MAX_CHARS) return avatar;
  return avatar.slice(0, SAVED_HANDLE_AVATAR_MAX_CHARS);
}

function normalizeSavedHandlesCookie(raw: unknown): Array<SavedHandle> {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Array<SavedHandle>;
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

/** Read the saved-handles cookie (server: pass the request's cookie header). */
export function getSavedHandles(
  cookieHeader?: string | null,
): Array<SavedHandle> {
  try {
    const cookies = new Cookies(cookieHeader || undefined);
    return normalizeSavedHandlesCookie(cookies.get(SAVED_HANDLES_COOKIE_NAME));
  } catch {
    return [];
  }
}

/** Client-only: remember a handle (most-recent first, capped at 5). */
export function saveHandle(handle: string, avatar: string | null): void {
  if (globalThis.window === undefined) return;
  try {
    const saved = getSavedHandles();
    const filtered = saved.filter((h) => h.handle !== handle);
    const updated = [
      { handle, avatar: truncateAvatarForCookie(avatar), lastUsed: Date.now() },
      ...filtered,
    ]
      .toSorted((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, 5);

    const cookies = new Cookies();
    cookies.set(SAVED_HANDLES_COOKIE_NAME, updated, {
      path: "/",
      sameSite: "lax",
      secure: globalThis.location.protocol === "https:",
      maxAge: 365 * 24 * 60 * 60,
    });
  } catch {
    // Cookies may be unavailable.
  }
}
