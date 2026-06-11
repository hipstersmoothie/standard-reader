import { MARKPUB_MARKDOWN } from "#/lib/markpub/types";

import type { BlobRef } from "../atproto/types.ts";

import { blobCid, getBlobUrl } from "../atproto/blob.ts";

const MAX_BLOB_BYTES = 1_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchTextBlob(
  pds: string,
  did: string,
  cid: string,
): Promise<string | null> {
  try {
    const response = await fetch(getBlobUrl(pds, did, cid), {
      redirect: "follow",
    });
    if (!response.ok) return null;
    const length = response.headers.get("content-length");
    if (length && Number(length) > MAX_BLOB_BYTES) return null;
    const text = await response.text();
    return text.length > MAX_BLOB_BYTES ? null : text;
  } catch {
    return null;
  }
}

/**
 * Inline `at.markpub.text#textBlob` when the markdown body lives on the PDS.
 * The blob overrides inline `markdown` per the lexicon.
 */
export async function resolveMarkpubContent(
  content: unknown,
  did: string,
  pds: string | null | undefined,
): Promise<unknown> {
  if (!isRecord(content) || content.$type !== MARKPUB_MARKDOWN) {
    return content;
  }
  const text = isRecord(content.text) ? content.text : null;
  if (!text) return content;

  const cid = blobCid(text.textBlob as BlobRef | undefined);
  if (!cid || !pds) return content;

  const markdown = await fetchTextBlob(pds, did, cid);
  if (!markdown?.trim()) return content;

  return {
    ...content,
    text: {
      ...text,
      markdown,
    },
  };
}
