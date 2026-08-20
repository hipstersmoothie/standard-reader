/**
 * Handing a generated book to the client.
 *
 * Generation is deterministic (see `zip.ts`), so the bytes hash to a stable
 * `ETag` — which matters more here than for a page: e-reader sync tools refetch
 * whole shelves on a schedule, and a 304 is the difference between a KOReader
 * sync that costs one round trip and one that re-downloads forty megabytes over
 * hotel wifi.
 */

import { createHash } from "node:crypto";

/**
 * A book is only as fresh as the newest thing in it, and the reader's device
 * caches the file anyway. Short public cache, long stale window.
 */
export const BOOK_CACHE_CONTROL =
  "public, max-age=600, stale-while-revalidate=86400";

/** A reader's own shelf, built from their subscriptions — never shared cache. */
export const BOOK_PRIVATE_CACHE_CONTROL = "private, max-age=300";

/**
 * RFC 6266 `Content-Disposition` with both the ASCII and UTF-8 filename forms.
 *
 * The plain `filename` is ASCII-safe by construction (`bookFilename`); the
 * `filename*` form carries the accented original for clients that read it.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replaceAll(/[^ -~]/g, "_").replaceAll('"', "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function bookResponse(
  bytes: Uint8Array,
  {
    filename,
    contentType,
    request,
    cacheControl = BOOK_CACHE_CONTROL,
  }: {
    filename: string;
    contentType: string;
    request: Request;
    cacheControl?: string;
  },
): Response {
  const etag = `"${createHash("sha1").update(bytes).digest("hex")}"`;

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": cacheControl,
    "Content-Disposition": contentDisposition(filename),
    "Content-Type": contentType,
    ETag: etag,
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { headers, status: 304 });
  }

  return new Response(bytes as BodyInit, {
    headers: { ...headers, "Content-Length": String(bytes.length) },
  });
}
