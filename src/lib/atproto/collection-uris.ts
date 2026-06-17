import { COLLECTION } from "#/lib/atproto/nsids";

/** Build the AT URI for a collection document in `repo`. Client-safe. */
export function collectionDocumentUri(repo: string, rkey: string): string {
  return `at://${repo}/${COLLECTION.document}/${rkey}`;
}

/** Build the AT URI for a collections publication in `repo`. Client-safe. */
export function collectionsPublicationUri(
  repo: string,
  publicationRkey: string,
): string {
  return `at://${repo}/${COLLECTION.publication}/${publicationRkey}`;
}
