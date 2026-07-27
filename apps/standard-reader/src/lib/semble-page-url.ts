const SEMBLE_WEB_ORIGIN = "https://semble.so";

/** Semble activity page for a bookmarked URL (`/url?id=…`). */
export function semblePageUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;

  return `${SEMBLE_WEB_ORIGIN}/url?id=${encodeURIComponent(trimmed)}`;
}
