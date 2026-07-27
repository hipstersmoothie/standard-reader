import { LEAFLET_CONTENT } from "#/lib/leaflet/types";

import { blobCid, getBlobUrl } from "../atproto/blob";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchJsonBlob(
  pds: string,
  did: string,
  cid: string,
): Promise<unknown | null> {
  const url = getBlobUrl(pds, did, cid);
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Inline `pages` when present; otherwise fetch the `blobPages` JSON blob from
 * the authoring PDS (large leaflet documents store blocks out-of-record).
 */
export async function resolveLeafletContent(
  content: unknown,
  did: string,
  pds: string | null | undefined,
): Promise<unknown> {
  if (!isRecord(content) || content.$type !== LEAFLET_CONTENT) {
    return content;
  }

  const pages = content.pages;
  if (Array.isArray(pages) && pages.length > 0) {
    return content;
  }

  const cid = blobCid(content.blobPages as Parameters<typeof blobCid>[0]);
  if (!cid || !pds) {
    return content;
  }

  const fetched = await fetchJsonBlob(pds, did, cid);
  if (!Array.isArray(fetched)) {
    return content;
  }

  return { ...content, pages: fetched };
}
