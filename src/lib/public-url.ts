/** Public base URL for absolute links (OG tags, OAuth, share URLs). */
export function getPublicUrl(): string {
  const url =
    process.env.PUBLIC_URL ||
    process.env.BETTER_AUTH_URL ||
    process.env.ATPROTO_BASE_URL;
  if (!url) {
    throw new Error(
      "PUBLIC_URL (or BETTER_AUTH_URL / ATPROTO_BASE_URL) environment variable is required",
    );
  }
  return url.replace("localhost", "127.0.0.1").replace(/\/$/, "");
}

/** Browser-safe public URL — falls back to the current origin in dev. */
export function getPublicUrlClient(): string {
  if (globalThis.window !== undefined) {
    return globalThis.window.location.origin;
  }
  return getPublicUrl();
}
