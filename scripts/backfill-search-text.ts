/**
 * One-off / cron-safe backfill for document `text_content` from record
 * textContent plus structured content blocks (leaflet + JSON blocks).
 *
 *   pnpm backfill:search-text
 */
import { backfillDocumentSearchText } from "../src/server/ingest/recompute.ts";

const updated = await backfillDocumentSearchText();
// eslint-disable-next-line no-console
console.log(`Backfilled search text for ${updated} documents.`);
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
