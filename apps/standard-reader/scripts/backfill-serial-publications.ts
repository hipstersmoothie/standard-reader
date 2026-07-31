/**
 * Backfill the serial-publication read model.
 *
 * Two passes: re-read every publisher's `site.standard.publication` records so
 * `prev_next_direction` lands on rows indexed before the column existed, then
 * derive `serial_kind` (comic vs book) for the publications that turn out to be
 * serials. Safe to re-run — both passes are idempotent.
 *
 * Not required for correctness: `ensurePublicationSerial` backfills each
 * publication on its first view anyway. This just warms them all at once, so the
 * first reader of each publication doesn't pay the PDS read.
 *
 *   pnpm backfill:serial
 */
import { recomputeSerialKinds } from "../src/server/ingest/recompute.ts";
import { backfillPublicationRecords } from "../src/server/ingest/repo-sync.ts";

const records = await backfillPublicationRecords();
// eslint-disable-next-line no-console
console.log(
  `Re-read ${records.publications} publication records across ${records.repos} repos (${records.failed} failed).`,
);

await recomputeSerialKinds();
// eslint-disable-next-line no-console
console.log("Derived serial_kind for serial publications.");
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
