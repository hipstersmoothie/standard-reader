import type { CollectionManifest } from "#/lib/collections/manifest";

import { collectionManifestFromSources } from "#/lib/collections/manifest";
import {
  getCollectionRecord,
  getDocumentRecord,
} from "#/server/atproto/repo-get-records";

type RepoClient = Parameters<typeof getDocumentRecord>[0];

/**
 * When the signed-in user owns a collection document, read the manifest
 * straight from their repo so edits (including colophon) show immediately
 * without waiting on ingest. Prefers the `app.standard-reader.collection`
 * sidecar; falls back to the legacy `readerCollection` extension field.
 */
export async function collectionManifestForOwner(
  client: RepoClient,
  ownerDid: string,
  rkey: string,
  cached: CollectionManifest | null,
): Promise<CollectionManifest | null> {
  try {
    const sidecar = await getCollectionRecord(client, ownerDid, rkey);
    const fromSidecar = sidecar
      ? collectionManifestFromSources({ sidecar })
      : null;
    if (fromSidecar) return fromSidecar;

    const value = await getDocumentRecord(client, ownerDid, rkey);
    return collectionManifestFromSources({ legacyDocument: value }) ?? cached;
  } catch {
    return cached;
  }
}
