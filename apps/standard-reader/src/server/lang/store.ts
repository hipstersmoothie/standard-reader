/**
 * Writing detected languages to `document_languages`.
 *
 * One upsert path for every writer — ingest, the hourly sweep, the Jev
 * tiebreak, the corpus backfill — so a re-detection always replaces the whole
 * row (language, confidence, source, timestamp) rather than leaving a stale
 * field behind.
 */
import { sql } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { documentLanguages } from "../../db/schema.ts";
import type { NewDocumentLanguage } from "../../db/schema.ts";

/**
 * Rows per statement. Narrow rows, so this is bounded by round trips rather
 * than payload — the database is a continent away from the worker.
 */
const WRITE_CHUNK = 500;

/**
 * Upsert language rows. The caller's rows must not repeat a document: one
 * `INSERT … ON CONFLICT DO UPDATE` cannot touch the same row twice.
 */
export async function writeDocumentLanguages(
  rows: Array<NewDocumentLanguage>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    await db
      .insert(documentLanguages)
      .values(rows.slice(i, i + WRITE_CHUNK))
      .onConflictDoUpdate({
        set: {
          confidence: sql`excluded.confidence`,
          detectedAt: sql`excluded.detected_at`,
          lang: sql`excluded.lang`,
          source: sql`excluded.source`,
        },
        target: documentLanguages.documentUri,
      });
  }
}
