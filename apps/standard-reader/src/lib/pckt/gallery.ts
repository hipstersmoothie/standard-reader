import { fetchRepoRecordWithFallback } from "#/server/atproto/fetch-record";
import { parseAtUri } from "#/server/atproto/uri";

import type { PcktImageAttrs, PcktImageBlock } from "./types";
import { PCKT_BLOCK } from "./types";
export const PCKT_GALLERY = "blog.pckt.gallery";

export interface PcktGalleryRecord {
  $type?: string;
  title?: string;
  caption?: string;
  layout?: string;
  images?: Array<PcktImageAttrs>;
}

/** Fetch a `blog.pckt.gallery` record referenced by a gallery block.
 *
 * Routes through `fetchRepoRecordWithFallback` (Slingshot first, PDS fallback)
 * so the browser doesn't have to do its own PLC resolution — Slingshot caches
 * records across PDSes and serves them without per-DID identity lookups. */
export async function fetchPcktGallery(galleryUri: string): Promise<{
  record: PcktGalleryRecord;
  did: string;
  pds: string;
} | null> {
  const parsed = parseAtUri(galleryUri);
  if (!parsed || parsed.collection !== PCKT_GALLERY) return null;

  const result = await fetchRepoRecordWithFallback(galleryUri);
  if (!result?.value) return null;
  return {
    record: result.value as PcktGalleryRecord,
    did: parsed.did,
    pds: result.base,
  };
}

/** Wrap flat gallery image attrs as a pckt image block for shared URL helpers. */
export function pcktImageBlockFromAttrs(attrs: PcktImageAttrs): PcktImageBlock {
  return { $type: PCKT_BLOCK.image, attrs };
}
