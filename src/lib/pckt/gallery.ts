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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAtUri(uri: string): {
  did: string;
  collection: string;
  rkey: string;
} | null {
  if (!uri.startsWith("at://")) return null;
  const rest = uri.slice("at://".length);
  const parts = rest.split("/");
  if (parts.length < 3) return null;
  const [did, collection, ...rkeyParts] = parts;
  const rkey = rkeyParts.join("/");
  if (!did?.startsWith("did:") || !collection || !rkey) return null;
  return { did, collection, rkey };
}

async function resolvePds(did: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://plc.directory/${encodeURIComponent(did)}`,
    );
    if (!response.ok) return null;
    const doc: unknown = await response.json();
    if (!isRecord(doc) || !Array.isArray(doc.service)) return null;
    const pds = doc.service.find(
      (service): service is { id: string; serviceEndpoint: string } =>
        isRecord(service) &&
        service.id === "#atproto_pds" &&
        typeof service.serviceEndpoint === "string",
    );
    return pds?.serviceEndpoint ?? null;
  } catch {
    return null;
  }
}

/** Fetch a `blog.pckt.gallery` record referenced by a gallery block. */
export async function fetchPcktGallery(galleryUri: string): Promise<{
  record: PcktGalleryRecord;
  did: string;
  pds: string;
} | null> {
  const parsed = parseAtUri(galleryUri);
  if (!parsed || parsed.collection !== PCKT_GALLERY) return null;

  const pds = await resolvePds(parsed.did);
  if (!pds) return null;

  const params = new URLSearchParams({
    repo: parsed.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  });
  const url = `${pds.replace(/\/+$/, "")}/xrpc/com.atproto.repo.getRecord?${params}`;

  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !isRecord(payload.value)) return null;
    return {
      record: payload.value as PcktGalleryRecord,
      did: parsed.did,
      pds,
    };
  } catch {
    return null;
  }
}

/** Wrap flat gallery image attrs as a pckt image block for shared URL helpers. */
export function pcktImageBlockFromAttrs(attrs: PcktImageAttrs): PcktImageBlock {
  return { $type: PCKT_BLOCK.image, attrs };
}
