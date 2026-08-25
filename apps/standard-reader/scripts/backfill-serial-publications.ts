/**
 * Backfill the serial-publication read model.
 *
 * Two passes: read the `site.standard.publication` record of every Leaflet
 * publication still missing `prev_next_direction` and write what it says, then
 * derive `serial_kind` (comic vs book) for the ones that turn out to be serials.
 * Safe to re-run — both passes are idempotent, and the first only fills NULLs.
 *
 * Not required for correctness: `ensurePublicationSerial` backfills each
 * publication on its first view anyway. This just warms them ahead of time, so
 * the first reader of each doesn't pay the record read.
 *
 *   pnpm backfill:serial
 */
import { recomputeSerialKinds } from "../src/server/ingest/recompute.ts";
import { backfillSerialPublicationRecords } from "../src/server/ingest/repo-sync.ts";

const started = Date.now();

const records = await backfillSerialPublicationRecords();
// eslint-disable-next-line no-console
console.log(
  `Read ${records.read} of ${records.candidates} publication records ` +
    `(${records.serials} serial, ${records.failed} unreadable).`,
);

await recomputeSerialKinds();
// eslint-disable-next-line no-console
console.log(
  `Derived serial_kind for serial publications. (${Math.round((Date.now() - started) / 1000)}s)`,
);
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
