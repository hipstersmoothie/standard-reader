export const DEFAULT_AUTH_REDIRECT = "/";

function isDisallowedRedirectPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_serverFn") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/login")
  );
}

function toSafePathname(value: string, origin: string): string | null {
  if (!value) {
    return null;
  }

  try {
    if (value.startsWith("/")) {
      const parsed = new URL(value, origin);
      if (isDisallowedRedirectPath(parsed.pathname)) {
        return null;
      }
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    const parsed = new URL(value);
    if (parsed.origin !== origin) {
      return null;
    }
    if (isDisallowedRedirectPath(parsed.pathname)) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function sanitizeAuthRedirectTarget(
  candidate: string | undefined,
  requestUrl: string,
): string {
  let origin: string;
  try {
    origin = new URL(requestUrl).origin;
  } catch {
    // requestUrl is a relative path (e.g. from TanStack Router's
    // location.href in a route loader, which is pathname+search+hash, not
    // a full URL). Use a dummy origin so we can still parse the candidate.
    origin = "http://localhost";
  }
  return toSafePathname(candidate ?? "", origin) ?? DEFAULT_AUTH_REDIRECT;
}

function serializeSearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        params.append(key, String(entry));
      }
      continue;
    }
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Build a same-origin path (+ query + hash) suitable for post-login redirect. */
export function buildAuthRedirectPath(
  pathname: string,
  search: Record<string, unknown> | string = {},
  hash = "",
): string {
  const searchPart =
    typeof search === "string"
      ? search.startsWith("?") || search === ""
        ? search
        : `?${search}`
      : serializeSearch(search);
  const hashPart = hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return `${pathname}${searchPart}${hashPart}`;
}

/** Login route search params that return the user here after sign-in. */
export function loginSearchFromLocation(
  pathname: string,
  search: Record<string, unknown>,
  hash: string,
  origin: string,
): { redirect?: string } {
  const candidate = buildAuthRedirectPath(pathname, search, hash);
  const sanitized = sanitizeAuthRedirectTarget(candidate, origin);
  if (sanitized === DEFAULT_AUTH_REDIRECT) {
    return {};
  }
  return { redirect: sanitized };
}
