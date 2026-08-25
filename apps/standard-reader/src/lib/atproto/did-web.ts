/**
 * `did:web` location rules, in one place.
 *
 * The method encodes a hostname **with its dots intact** and reserves the colon
 * as the path separator:
 *
 * - `did:web:example.com` → `https://example.com/.well-known/did.json`
 * - `did:web:example.com:user:alice` → `https://example.com/user/alice/did.json`
 *
 * Note the second form drops `/.well-known/` entirely — a path-bearing DID
 * points at `did.json` directly under its path. Every resolver here used to
 * concatenate the two, which meant a path-bearing DID was fetched from a URL
 * the spec never names.
 *
 * A port is encoded as a percent-escaped colon in the first segment
 * (`did:web:localhost%3A3000`), which is why the host is decoded before use.
 */

/** Prefix of a `did:web` identifier. */
const DID_WEB_PREFIX = "did:web:";

/**
 * The URL a `did:web` identifier's DID document lives at, or `null` when `did`
 * is not a well-formed `did:web`.
 *
 * Callers are still responsible for SSRF-checking the result — the host comes
 * from whoever authored the DID.
 */
export function didWebDocumentUrl(did: string): string | null {
  if (!did.startsWith(DID_WEB_PREFIX)) return null;
  const segments = did.slice(DID_WEB_PREFIX.length).split(":");
  const [rawHost, ...path] = segments;
  if (!rawHost) return null;
  // Reject empty path segments (`did:web:example.com::a`) rather than
  // collapsing them into a different URL than the DID names.
  if (path.some((segment) => segment === "")) return null;

  let host: string;
  try {
    host = decodeURIComponent(rawHost);
  } catch {
    return null;
  }
  if (host.includes("/") || host.includes("?") || host.includes("#")) {
    return null;
  }

  const suffix =
    path.length > 0 ? `/${path.join("/")}/did.json` : "/.well-known/did.json";
  try {
    return new URL(`https://${host}${suffix}`).toString();
  } catch {
    return null;
  }
}
