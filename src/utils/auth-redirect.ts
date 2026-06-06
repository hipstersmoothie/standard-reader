const DEFAULT_AUTH_REDIRECT = "/";

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
  const origin = new URL(requestUrl).origin;
  return toSafePathname(candidate ?? "", origin) ?? DEFAULT_AUTH_REDIRECT;
}
