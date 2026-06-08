/**
 * One-off / cron-safe backfill for document `has_renderable_body` — whether the
 * reader renders an in-app body vs. linking out to the publication site.
 *
 *   pnpm backfill:renderable
 */
import { backfillRenderableBody } from "../src/server/ingest/recompute.ts";

const updated = await backfillRenderableBody();
// eslint-disable-next-line no-console
console.log(`Backfilled has_renderable_body for ${updated} documents.`);
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
