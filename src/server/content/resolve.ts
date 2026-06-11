/**
 * Ingest-time resolution for content formats whose body lives outside the
 * document record and needs an extra fetch:
 *
 * - `app.greengale.document#contentRef` → referenced record (greengale/resolve)
 * - `site.standard.markdown`            → markdown blob → inline standard markdown
 * - `net.yrriban.content`               → `doc.html` blob → inline `html` field
 * - `at.markpub.markdown`               → `text.textBlob` → inline `text.markdown`
 *
 * Resolution is best-effort: on any failure the original content is returned
 * unchanged so re-ingest/backfill can retry later.
 */
import { MARKPUB_MARKDOWN } from "#/lib/markpub/types";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { GREENGALE_CONTENT_REF } from "#/lib/greengale/types";
import { resolveGreengaleContent } from "#/server/greengale/resolve";
import { resolveMarkpubContent } from "#/server/markpub/resolve";

import type { BlobRef } from "../atproto/types.ts";

import { blobCid, getBlobUrl } from "../atproto/blob.ts";

export const STANDARD_MARKDOWN_BLOB = "site.standard.markdown";
export const YRRIBAN_CONTENT = "net.yrriban.content";

/** Formats that need ingest-time fetching (used by the backfill script too). */
export const FETCHED_CONTENT_FORMATS = [
  GREENGALE_CONTENT_REF,
  STANDARD_MARKDOWN_BLOB,
  YRRIBAN_CONTENT,
  MARKPUB_MARKDOWN,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const MAX_BLOB_BYTES = 2_000_000;

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

/** `site.standard.markdown` (markdown blob) → inline standard markdown. */
async function resolveStandardMarkdownBlob(
  content: Record<string, unknown>,
  did: string,
  pds: string | null | undefined,
): Promise<unknown> {
  const cid = blobCid(content.blob as BlobRef | undefined);
  if (!cid || !pds) return content;

  const markdown = await fetchTextBlob(pds, did, cid);
  if (!markdown?.trim()) return content;

  return {
    $type: STANDARD_MARKDOWN_CONTENT,
    text: markdown,
  };
}

/** `net.yrriban.content` → fetch the `doc.html` blob and inline it as `html`. */
async function resolveYrribanContent(
  content: Record<string, unknown>,
  did: string,
  pds: string | null | undefined,
): Promise<unknown> {
  if (typeof content.html === "string" && content.html.trim()) {
    return content; // already resolved
  }
  const blobs = isRecord(content.blobs) ? content.blobs : null;
  const cid = blobs ? blobCid(blobs["doc.html"] as BlobRef | undefined) : null;
  if (!cid || !pds) return content;

  const html = await fetchTextBlob(pds, did, cid);
  if (!html?.trim()) return content;

  return { ...content, html };
}

/**
 * Resolve a fetch-backed content payload to its inline form. Returns the
 * (possibly updated) content and the content format to store — greengale and
 * standard-markdown blobs normalize to `site.standard.content.markdown`.
 */
export async function resolveFetchedContent(
  contentFormat: string | null | undefined,
  content: unknown,
  did: string,
  pds: string | null | undefined,
): Promise<{ content: unknown; contentFormat: string | null }> {
  const unchanged = { content, contentFormat: contentFormat ?? null };
  if (!isRecord(content)) return unchanged;

  if (contentFormat === GREENGALE_CONTENT_REF) {
    const resolved = await resolveGreengaleContent(content, did, pds);
    if (isRecord(resolved) && resolved.$type === STANDARD_MARKDOWN_CONTENT) {
      return { content: resolved, contentFormat: STANDARD_MARKDOWN_CONTENT };
    }
    return unchanged;
  }

  if (contentFormat === STANDARD_MARKDOWN_BLOB) {
    const resolved = await resolveStandardMarkdownBlob(content, did, pds);
    if (isRecord(resolved) && resolved.$type === STANDARD_MARKDOWN_CONTENT) {
      return { content: resolved, contentFormat: STANDARD_MARKDOWN_CONTENT };
    }
    return unchanged;
  }

  if (contentFormat === YRRIBAN_CONTENT) {
    const resolved = await resolveYrribanContent(content, did, pds);
    return { content: resolved, contentFormat: YRRIBAN_CONTENT };
  }

  if (contentFormat === MARKPUB_MARKDOWN) {
    const resolved = await resolveMarkpubContent(content, did, pds);
    return { content: resolved, contentFormat: MARKPUB_MARKDOWN };
  }

  return unchanged;
}
