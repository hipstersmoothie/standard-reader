import { eq } from "drizzle-orm";

import { documents } from "#/db/schema";
/**
 * Read-path content resolution that persists the resolved form back to the DB.
 *
 * Background: several third-party content formats store their body out-of-record
 * (a blob on the authoring PDS, or a referenced Greengale record). The ingester
 * inlines these into `documents.content_json` at tap time, so the DB is normally
 * the source of truth and the read path should never hit the PDS.
 *
 * But rows can land un-inlined (transient PDS outage at ingest, a format newly
 * supported after deploy, etc.). Before this module, the read path re-ran the
 * resolvers on **every** article view and never wrote the result back — so a
 * single un-backfilled row produced a per-request PDS `com.atproto.sync.getBlob`
 * fetch forever. This module does the fetch at most once per row, then writes
 * the inlined form so future reads stay on the DB (per the AGENTS.md rule:
 * "never hit the PDS for a read when data exists in the DB").
 */
import type { Db, JsonValue } from "#/integrations/tanstack-query/api-shapes";
import { hasRenderableArticleBody } from "#/lib/document/renderable";
import { documentSearchText } from "#/lib/document/search-text";
import { STANDARD_MARKDOWN_CONTENT } from "#/lib/document/structured-content/types";
import { GREENGALE_CONTENT_REF } from "#/lib/greengale/types";
import { LEAFLET_CONTENT } from "#/lib/leaflet/types";
import { MARKPUB_MARKDOWN } from "#/lib/markpub/types";
import { PCKT_CONTENT } from "#/lib/pckt/types";
import { blobCid } from "#/server/atproto/blob";
import { authorPds } from "#/server/atproto/identity";
import type { BlobRef } from "#/server/atproto/types";
import {
  FETCHED_CONTENT_FORMATS,
  STANDARD_MARKDOWN_BLOB,
  YRRIBAN_CONTENT,
  resolveFetchedContent,
} from "#/server/content/resolve";
import { resolveGreengaleContent } from "#/server/greengale/resolve";
import { sanitizeJson } from "#/server/ingest/mappers";
import { resolveLeafletContent } from "#/server/leaflet/resolve";
import { resolvePcktContent } from "#/server/pckt/resolve";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * True when the stored content still has a blob/ref that should be fetched from
 * the PDS. Mirrors the backfill script's `hasPendingFetch` — exported so the
 * read path and the backfill share one definition.
 */
export function hasPendingFetch(
  contentFormat: string | null | undefined,
  content: unknown,
): boolean {
  if (!isRecord(content) || !contentFormat) return false;

  if (contentFormat === STANDARD_MARKDOWN_BLOB) {
    return blobCid(content.blob as BlobRef | undefined) != null;
  }

  if (contentFormat === MARKPUB_MARKDOWN) {
    const text = isRecord(content.text) ? content.text : null;
    return blobCid(text?.textBlob as BlobRef | undefined) != null;
  }

  if (contentFormat === YRRIBAN_CONTENT) {
    if (typeof content.html === "string" && content.html.trim()) return false;
    const blobs = isRecord(content.blobs) ? content.blobs : null;
    return blobCid(blobs?.["doc.html"] as BlobRef | undefined) != null;
  }

  if (contentFormat === GREENGALE_CONTENT_REF) {
    return true;
  }

  // Leaflet/pckt store blocks in a blob only when the inline `pages`/`items`
  // array is absent or empty — the resolvers early-return otherwise, but we
  // still need to attempt the fetch once.
  if (contentFormat === LEAFLET_CONTENT) {
    const pages = content.pages;
    return !Array.isArray(pages) || pages.length === 0;
  }
  if (contentFormat === PCKT_CONTENT) {
    const items = content.items;
    return !Array.isArray(items) || items.length === 0;
  }

  return false;
}

export interface ResolvedContent {
  contentJson: JsonValue | null;
  contentFormat: string | null;
}

/**
 * Resolve fetch-backed content for a document row, fetching from the PDS at
 * most once and writing the inlined form back to `documents` so subsequent
 * reads stay on the DB. Returns the resolved content for the current request
 * regardless of whether the write succeeds.
 *
 * - If the row is already inlined (or not a fetch-backed format), returns the
 *   stored values unchanged — no PDS I/O, no DB write.
 * - Otherwise resolves via the same resolvers the ingester uses, then persists
 *   `content_json` + `content_format` + recomputed `text_content` /
 *   `has_renderable_body` + `updated_at`. The write is awaited so a concurrent
 *   read doesn't race to re-fetch; if it fails the caller still gets the
 *   in-memory result and the next read will retry.
 *
 * `cachedPds` is the PDS already loaded for the author (e.g. from the row's
 * profile join) — passing it avoids a redundant identity lookup.
 */
export async function resolveAndPersistContent(
  dbClient: Db,
  documentUri: string,
  did: string,
  storedContentJson: unknown,
  storedContentFormat: string | null,
  cachedPds: string | null,
): Promise<ResolvedContent> {
  const format = storedContentFormat;
  const raw = storedContentJson;

  // Fast path: nothing to fetch. This is the common case after ingest.
  if (!format || raw == null || !hasPendingFetch(format, raw)) {
    return {
      contentJson: (raw as JsonValue | null) ?? null,
      contentFormat: format,
    };
  }

  const pds = await authorPds(did, cachedPds);
  if (!pds) {
    return { contentJson: raw as JsonValue | null, contentFormat: format };
  }

  let resolved: unknown = raw;
  let resolvedFormat: string | null = format;

  try {
    if (format === LEAFLET_CONTENT) {
      resolved = await resolveLeafletContent(raw, did, pds);
    } else if (format === PCKT_CONTENT) {
      resolved = await resolvePcktContent(raw, did, pds);
    } else if (format === GREENGALE_CONTENT_REF) {
      resolved = await resolveGreengaleContent(raw, did, pds);
      if (isRecord(resolved) && resolved.$type === STANDARD_MARKDOWN_CONTENT) {
        resolvedFormat = STANDARD_MARKDOWN_CONTENT;
      }
    } else if (FETCHED_CONTENT_FORMATS.includes(format)) {
      const result = await resolveFetchedContent(format, raw, did, pds);
      resolved = result.content;
      resolvedFormat = result.contentFormat;
    } else {
      // Not a fetch-backed format after all.
      return { contentJson: raw as JsonValue | null, contentFormat: format };
    }
  } catch {
    // Resolver threw — leave the row as-is so the next read retries.
    return { contentJson: raw as JsonValue | null, contentFormat: format };
  }

  // Resolver couldn't inline (PDS 4xx/5xx, empty body, bad shape). Don't
  // persist a no-op write; the next read will retry.
  const stillPending = hasPendingFetch(resolvedFormat, resolved);
  if (stillPending) {
    return {
      contentJson: resolved as JsonValue | null,
      contentFormat: resolvedFormat,
    };
  }

  const contentJson = sanitizeJson(resolved) as JsonValue;
  const textContent = documentSearchText({
    textContent: null,
    contentJson,
    contentFormat: resolvedFormat,
  });
  const hasRenderableBody = hasRenderableArticleBody({
    textContent: null,
    contentJson,
    contentFormat: resolvedFormat,
  });

  try {
    await dbClient
      .update(documents)
      .set({
        contentJson,
        contentFormat: resolvedFormat,
        textContent,
        hasRenderableBody,
        updatedAt: new Date(),
      })
      .where(eq(documents.uri, documentUri));
  } catch {
    // Write failed (transient DB error, row concurrently deleted). The current
    // request still returns the in-memory resolved form; next read retries.
  }

  return { contentJson, contentFormat: resolvedFormat };
}
