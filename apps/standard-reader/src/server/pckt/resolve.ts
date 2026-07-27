import { PCKT_CONTENT } from "#/lib/pckt/types";

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

function itemsFromFetched(value: unknown): Array<unknown> | null {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return null;
  const items = value.items;
  return Array.isArray(items) ? items : null;
}

/**
 * Inline `items` when present; otherwise fetch the `blob` JSON blob from
 * the authoring PDS (large pckt documents store blocks out-of-record).
 */
export async function resolvePcktContent(
  content: unknown,
  did: string,
  pds: string | null | undefined,
): Promise<unknown> {
  if (!isRecord(content) || content.$type !== PCKT_CONTENT) {
    return content;
  }

  const items = content.items;
  if (Array.isArray(items) && items.length > 0) {
    return content;
  }

  const cid = blobCid(content.blob as Parameters<typeof blobCid>[0]);
  if (!cid || !pds) {
    return content;
  }

  const fetched = await fetchJsonBlob(pds, did, cid);
  const resolvedItems = itemsFromFetched(fetched);
  if (!resolvedItems) {
    return content;
  }

  return { ...content, items: resolvedItems };
}
