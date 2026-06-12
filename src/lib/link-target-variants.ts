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
