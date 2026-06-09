/**
 * One-off / cron-safe backfill for newly supported content formats.
 *
 * Phase 1 — fetch-backed formats: rows still stored as
 * `app.greengale.document#contentRef`, `site.standard.markdown`, or
 * `net.yrriban.content` get their content fetched from the authoring PDS and
 * inlined (same resolution the ingest hot path now performs).
 *
 * Phase 2 — every row in a newly supported format gets `text_content` and
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
import { hasRenderableArticleBody } from "../src/lib/document/renderable.ts";
import { documentSearchText } from "../src/lib/document/search-text.ts";
import { authorPds } from "../src/server/atproto/identity.ts";
import {
  FETCHED_CONTENT_FORMATS,
  resolveFetchedContent,
} from "../src/server/content/resolve.ts";
import { sanitizeJson } from "../src/server/ingest/mappers.ts";

const BATCH_SIZE = 50;

async function resolveFetchedRows(): Promise<{
  resolved: number;
  skipped: number;
}> {
  let cursor: string | null = null;
  let resolved = 0;
  let skipped = 0;
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

      // Unresolved (fetch failed / blob missing): leave the row for a retry.
      if (
        result.contentFormat === row.contentFormat &&
        result.content === row.contentJson
      ) {
        skipped++;
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

  return { resolved, skipped };
}

async function recomputeNewFormats(): Promise<number> {
  const formats = [
    ...ALT_MARKDOWN_FORMATS,
    ...HTML_CONTENT_FORMATS,
    ...STRUCTURED_BLOCK_FORMATS,
    LEAFLET_DOCUMENT_FORMAT,
  ];
  let cursor: string | null = null;
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

  return updated;
}

const fetched = await resolveFetchedRows();
// eslint-disable-next-line no-console
console.log(
  `Resolved ${fetched.resolved} fetch-backed documents (${fetched.skipped} left for retry).`,
);

const recomputed = await recomputeNewFormats();
// eslint-disable-next-line no-console
console.log(
  `Recomputed search text / renderable flags for ${recomputed} documents.`,
);

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
