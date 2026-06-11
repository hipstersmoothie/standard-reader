/**
 * One-off / cron-safe backfill for newly supported content formats.
 *
 * Phase 1 — fetch-backed formats (`FETCHED_CONTENT_FORMATS`): rows whose body
 * still lives on the authoring PDS get fetched and inlined (same resolution the
 * ingest hot path performs). Rows without a pending blob ref are counted as
 * already inline, not failures.
 *
 * Phase 2 — every row in a supported third-party format gets `text_content` and
 * `has_renderable_body` recomputed from the (possibly updated) content.
 *
 *   pnpm backfill:content-formats
 */
import type { SQL } from "drizzle-orm";

import { and, asc, eq, gt, inArray } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { documents } from "../src/db/schema.ts";
import {
  ALT_MARKDOWN_FORMATS,
  HTML_CONTENT_FORMATS,
  LEAFLET_DOCUMENT_FORMAT,
  STRUCTURED_BLOCK_FORMATS,
} from "../src/lib/document/content-formats.ts";
import { MARKPUB_MARKDOWN } from "../src/lib/markpub/types.ts";
import { hasRenderableArticleBody } from "../src/lib/document/renderable.ts";
import { documentSearchText } from "../src/lib/document/search-text.ts";
import { blobCid } from "../src/server/atproto/blob.ts";
import type { BlobRef } from "../src/server/atproto/types.ts";
import { authorPds } from "../src/server/atproto/identity.ts";
import { GREENGALE_CONTENT_REF } from "../src/lib/greengale/types.ts";
import {
  FETCHED_CONTENT_FORMATS,
  STANDARD_MARKDOWN_BLOB,
  YRRIBAN_CONTENT,
  resolveFetchedContent,
} from "../src/server/content/resolve.ts";
import { sanitizeJson } from "../src/server/ingest/mappers.ts";

const BATCH_SIZE = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when phase 1 still has a blob/ref on the record that should be fetched. */
function hasPendingFetch(
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

  return false;
}

async function resolveFetchedRows(): Promise<{
  resolved: number;
  alreadyInline: number;
  fetchFailed: number;
}> {
  let cursor: string | null = null;
  let resolved = 0;
  let alreadyInline = 0;
  let fetchFailed = 0;
  const pdsByDid = new Map<string, string | null>();

  for (;;) {
    const where: SQL | undefined =
      cursor == null
        ? and(
            eq(documents.deleted, false),
            inArray(documents.contentFormat, FETCHED_CONTENT_FORMATS),
          )
        : and(
            eq(documents.deleted, false),
            inArray(documents.contentFormat, FETCHED_CONTENT_FORMATS),
            gt(documents.uri, cursor),
          );
    const rows = await db
      .select({
        uri: documents.uri,
        did: documents.did,
        textContent: documents.textContent,
        contentJson: documents.contentJson,
        contentFormat: documents.contentFormat,
      })
      .from(documents)
      .where(where)
      .orderBy(asc(documents.uri))
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;
    cursor = rows.at(-1)?.uri ?? null;

    for (const row of rows) {
      let pds = pdsByDid.get(row.did);
      if (pds === undefined) {
        pds = await authorPds(row.did, null);
        pdsByDid.set(row.did, pds);
      }

      const result = await resolveFetchedContent(
        row.contentFormat,
        row.contentJson,
        row.did,
        pds,
      );

      const unchanged =
        result.contentFormat === row.contentFormat &&
        result.content === row.contentJson;

      if (unchanged) {
        if (hasPendingFetch(row.contentFormat, row.contentJson)) {
          fetchFailed++;
        } else {
          alreadyInline++;
        }
        continue;
      }

      const contentJson = sanitizeJson(result.content);
      const contentFormat = result.contentFormat;
      await db
        .update(documents)
        .set({
          contentFormat,
          contentJson,
          hasRenderableBody: hasRenderableArticleBody({
            textContent: row.textContent,
            contentJson,
            contentFormat,
          }),
          textContent: documentSearchText({
            textContent: row.textContent,
            contentJson,
            contentFormat,
          }),
          updatedAt: new Date(),
        })
        .where(eq(documents.uri, row.uri));
      resolved++;
    }

    if (rows.length < BATCH_SIZE) break;
  }

  return { resolved, alreadyInline, fetchFailed };
}

async function recomputeNewFormats(): Promise<{
  scanned: number;
  updated: number;
}> {
  const formats = [
    ...ALT_MARKDOWN_FORMATS,
    ...HTML_CONTENT_FORMATS,
    ...STRUCTURED_BLOCK_FORMATS,
    LEAFLET_DOCUMENT_FORMAT,
    MARKPUB_MARKDOWN,
  ];
  let cursor: string | null = null;
  let scanned = 0;
  let updated = 0;

  for (;;) {
    const where: SQL | undefined =
      cursor == null
        ? and(
            eq(documents.deleted, false),
            inArray(documents.contentFormat, formats),
          )
        : and(
            eq(documents.deleted, false),
            inArray(documents.contentFormat, formats),
            gt(documents.uri, cursor),
          );
    const rows = await db
      .select({
        uri: documents.uri,
        textContent: documents.textContent,
        contentJson: documents.contentJson,
        contentFormat: documents.contentFormat,
        hasRenderableBody: documents.hasRenderableBody,
      })
      .from(documents)
      .where(where)
      .orderBy(asc(documents.uri))
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;
    cursor = rows.at(-1)?.uri ?? null;
    scanned += rows.length;

    for (const row of rows) {
      const textContent = documentSearchText({
        textContent: row.textContent,
        contentJson: row.contentJson,
        contentFormat: row.contentFormat,
      });
      const renderable = hasRenderableArticleBody({
        textContent: row.textContent,
        contentJson: row.contentJson,
        contentFormat: row.contentFormat,
      });
      if (
        textContent === (row.textContent ?? null) &&
        renderable === row.hasRenderableBody
      ) {
        continue;
      }
      await db
        .update(documents)
        .set({
          hasRenderableBody: renderable,
          textContent,
          updatedAt: new Date(),
        })
        .where(eq(documents.uri, row.uri));
      updated++;
    }

    if (rows.length < BATCH_SIZE) break;
  }

  return { scanned, updated };
}

const fetched = await resolveFetchedRows();
const fetchTotal =
  fetched.resolved + fetched.alreadyInline + fetched.fetchFailed;
// eslint-disable-next-line no-console
console.log(
  `Phase 1 — fetch-backed formats: ${fetchTotal} rows scanned, ${fetched.resolved} resolved, ${fetched.alreadyInline} already inline, ${fetched.fetchFailed} fetch failed (retry later).`,
);

const recomputed = await recomputeNewFormats();
// eslint-disable-next-line no-console
console.log(
  `Phase 2 — third-party formats: ${recomputed.scanned} rows scanned, ${recomputed.updated} updated (search text / renderable flags).`,
);

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
