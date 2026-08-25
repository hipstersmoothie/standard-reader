/**
 * A URL only works as an article-level backlink target when it points at the
 * article's own page. A path-less document inherits its publication's bare
 * root as `canonicalUrl` — collection documents most of all, since collections
 * publications use the app origin itself as their `url` — and a backlink
 * lookup against a site root matches every post that links to the site, not
 * discussion of the article. Returns null for bare origins so those lookups
 * are skipped entirely.
 */
export function articleLinkTarget(url: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname === "/" && !parsed.search && !parsed.hash) {
      return null;
    }
  } catch {
    // Not a parseable absolute URL — it can't be a site root; keep it.
  }
  return trimmed;
}

/** URL normalization for canonical link matching (trailing slash variants). */
export function linkTargetVariants(url: string): Array<string> {
  const trimmed = url.trim();
  if (!trimmed) return [];

  const variants = new Set<string>([trimmed]);
  try {
    const parsed = new URL(trimmed);
    if (!parsed.search && !parsed.hash) {
      if (trimmed.endsWith("/")) {
        variants.add(trimmed.replace(/\/+$/, "") || trimmed);
      } else {
        variants.add(`${trimmed}/`);
      }
    }
  } catch {
    // Keep the original target when it is not a parseable absolute URL.
  }

  return [...variants];
}
