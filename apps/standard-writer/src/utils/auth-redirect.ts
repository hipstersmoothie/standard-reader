export const DEFAULT_AUTH_REDIRECT = "/";

function isDisallowedRedirectPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_serverFn") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/login")
  );
}

/**
 * Only allow same-origin, non-auth paths as post-login redirect targets so a
 * crafted `?redirect=` can't bounce the browser to another origin or loop
 * through the auth routes.
 */
export function sanitizeAuthRedirectTarget(
  candidate: string | undefined,
  requestUrl: string,
): string {
  if (!candidate) return DEFAULT_AUTH_REDIRECT;
  const origin = new URL(requestUrl).origin;
  try {
    const parsed = candidate.startsWith("/")
      ? new URL(candidate, origin)
      : new URL(candidate);
    if (parsed.origin !== origin) return DEFAULT_AUTH_REDIRECT;
    if (isDisallowedRedirectPath(parsed.pathname)) return DEFAULT_AUTH_REDIRECT;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
}
