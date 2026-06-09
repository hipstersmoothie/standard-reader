/**
 * Dry run of the search-text repair: reports what `backfillDocumentSearchText`
 * *would* write, without updating anything. Temporary diagnostic for the
 * compounded `text_content` bug.
 *
 *   pnpm exec tsx --env-file=.env scripts/dry-run-search-text-repair.ts
 */
import { and, asc, eq, gt } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { documents } from "../src/db/schema.ts";
import {
  documentExtractedText,
  documentSearchText,
  repairCompoundedSearchText,
} from "../src/lib/document/search-text.ts";

const BATCH_SIZE = 100;
let cursor: string | null = null;
let scanned = 0;
let wouldUpdate = 0;
let beforeChars = 0;
let afterChars = 0;
const samples: Array<{ uri: string; before: number; after: number }> = [];

for (;;) {
  const rows = await db
    .select({
      uri: documents.uri,
      textContent: documents.textContent,
      contentJson: documents.contentJson,
      contentFormat: documents.contentFormat,
    })
    .from(documents)
    .where(
      cursor == null
        ? eq(documents.deleted, false)
        : and(eq(documents.deleted, false), gt(documents.uri, cursor)),
    )
    .orderBy(asc(documents.uri))
    .limit(BATCH_SIZE);

  if (rows.length === 0) break;
  cursor = rows.at(-1)?.uri ?? null;
  scanned += rows.length;

  for (const row of rows) {
    const base = row.textContent
      ? repairCompoundedSearchText(
          row.textContent,
          documentExtractedText(row.contentJson, row.contentFormat),
        )
      : row.textContent;
    const next = documentSearchText({
      textContent: base,
      contentJson: row.contentJson,
      contentFormat: row.contentFormat,
    });
    if (next === (row.textContent ?? null)) continue;
    wouldUpdate++;
    beforeChars += row.textContent?.length ?? 0;
    afterChars += next?.length ?? 0;
    if (samples.length < 10) {
      samples.push({
        uri: row.uri,
        before: row.textContent?.length ?? 0,
        after: next?.length ?? 0,
      });
    }
  }

  if (rows.length < BATCH_SIZE) break;
}

console.log(`Scanned ${scanned} documents.`);
console.log(`Would update ${wouldUpdate} rows.`);
console.log(`Total chars: ${beforeChars} -> ${afterChars}`);
console.log("Samples:", samples);
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
