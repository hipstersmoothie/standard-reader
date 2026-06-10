import { STANDARD_NSID } from "#/lib/atproto/nsids";
import { getPublicUrlClient } from "#/lib/public-url";

const STATIC_ROUTES = [
  "/",
  "/about",
  "/discover",
  "/latest",
  "/likes",
  "/saved",
  "/login",
  "/search",
] as const;

export type StaticInternalRoute = (typeof STATIC_ROUTES)[number];

export type InternalRoute =
  | { to: StaticInternalRoute; params?: undefined }
  | { to: "/a/$did/$rkey"; params: { did: string; rkey: string } }
  | { to: "/p/$did/$rkey"; params: { did: string; rkey: string } };

const ARTICLE_PATH = /^\/a\/([^/]+)\/([^/]+)\/?$/;
const PUBLICATION_PATH = /^\/p\/([^/]+)\/([^/]+)\/?$/;

function parseAtUri(href: string): InternalRoute | null {
  if (!href.startsWith("at://")) return null;
  const rest = href.slice("at://".length);
  const slash = rest.indexOf("/");
  if (slash === -1) return null;
  const did = rest.slice(0, slash);
  const after = rest.slice(slash + 1);
  const nextSlash = after.indexOf("/");
  if (nextSlash === -1) return null;
  const collection = after.slice(0, nextSlash);
  const rkey = after.slice(nextSlash + 1);
  if (!did.startsWith("did:") || rkey.length === 0) return null;

  if (collection === STANDARD_NSID.document) {
    return { to: "/a/$did/$rkey", params: { did, rkey } };
  }
  if (collection === STANDARD_NSID.publication) {
    return { to: "/p/$did/$rkey", params: { did, rkey } };
  }
  return null;
}

function parsePathname(pathname: string): InternalRoute | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  if ((STATIC_ROUTES as ReadonlyArray<string>).includes(normalized)) {
    return { to: normalized as StaticInternalRoute };
  }

  const articleMatch = ARTICLE_PATH.exec(pathname);
  if (articleMatch) {
    return {
      to: "/a/$did/$rkey",
      params: {
        did: decodeURIComponent(articleMatch[1] ?? ""),
        rkey: decodeURIComponent(articleMatch[2] ?? ""),
      },
    };
  }

  const publicationMatch = PUBLICATION_PATH.exec(pathname);
  if (publicationMatch) {
    return {
      to: "/p/$did/$rkey",
      params: {
        did: decodeURIComponent(publicationMatch[1] ?? ""),
        rkey: decodeURIComponent(publicationMatch[2] ?? ""),
      },
    };
  }

  return null;
}

/**
 * Map an `href` (relative path, same-origin URL, or `at://` record URI) to a
 * TanStack Router destination. Returns null for external URLs.
 */
export function parseInternalRoute(
  href: string,
  origin = getPublicUrlClient(),
): InternalRoute | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  const atRoute = parseAtUri(trimmed);
  if (atRoute) return atRoute;

  try {
    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
      const pathname = trimmed.split(/[?#]/)[0] ?? trimmed;
      return parsePathname(pathname);
    }

    const url = new URL(trimmed);
    const appOrigin = new URL(origin).origin;
    if (url.origin !== appOrigin) return null;
    return parsePathname(url.pathname);
  } catch {
    return null;
  }
}
