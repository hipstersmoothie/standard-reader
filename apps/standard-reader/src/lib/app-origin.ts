/**
 * Hosts that ARE the Standard Reader app itself. A link pointing at one of these
 * is internal navigation or a self-reference to the product — never a
 * third-party publication, document, or user in the read model. Link resolvers
 * must therefore not fuzzy-match such an href against `publications.url` or
 * `documents.canonical_url`; doing so surfaces an unrelated entity's hovercard
 * whenever some record happens to carry our own domain as its URL.
 *
 * The canonical production domain (`did:web:standard-reader.app`) is pinned here
 * so resolution stays correct even in local dev, where the runtime public origin
 * is `127.0.0.1` and would otherwise miss a `https://standard-reader.app` link.
 * The runtime origin is additionally matched at call time.
 */
const APP_HOSTS: ReadonlySet<string> = new Set([
  "standard-reader.app",
  "www.standard-reader.app",
]);

function hostOf(value: string): string | null {
  try {
    return new URL(value.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True when `href` (an absolute URL) points at the Standard Reader app's own
 * origin — either the pinned canonical domain(s) or the given runtime origin.
 * Relative/unparseable hrefs return false (callers resolve those separately).
 */
export function isAppOriginHref(href: string, runtimeOrigin: string): boolean {
  const host = hostOf(href);
  if (host == null) return false;
  if (APP_HOSTS.has(host)) return true;
  const runtimeHost = hostOf(runtimeOrigin);
  return runtimeHost != null && host === runtimeHost;
}
