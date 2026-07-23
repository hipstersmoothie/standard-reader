const TRAILING_PUNCT_RE = /[),.!?;:'"\]]+$/;

/** Strip `@`, trailing punctuation, and whitespace from a handle or DID. */
export function normalizeAuthorRef(ref: string): string {
  let normalized = ref.trim().replace(TRAILING_PUNCT_RE, "");
  if (normalized.startsWith("@")) {
    normalized = normalized.slice(1);
  }
  return normalized;
}

/** In-app author profile path (`/u/$did` accepts a DID or handle). */
export function authorProfilePath(ref: string): string {
  return `/u/${encodeURIComponent(normalizeAuthorRef(ref))}`;
}
