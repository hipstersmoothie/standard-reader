import { publicationLinkParams } from "#/components/reader/format";

/**
 * In-app publication path (`/p/$did/$rkey`), or null when the AT-URI can't be
 * parsed into one. Mirrors {@link authorProfilePath} in `author-profile.ts`.
 */
export function publicationPagePath(uri: string): string | null {
  const params = publicationLinkParams(uri);
  if (!params) return null;
  return `/p/${encodeURIComponent(params.did)}/${encodeURIComponent(params.rkey)}`;
}
