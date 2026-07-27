/**
 * One-off / cron-safe backfill for `profiles.handle` on actors stranded without
 * a usable handle (`null`, or the `handle.invalid` sentinel). Re-resolves each
 * affected DID from its DID document and writes back the real handle, which in
 * turn fixes every denormalized `ownerHandle` read off the profile row (issue #4).
 *
 *   pnpm backfill:actor-handles
 */
import { backfillActorHandles } from "../src/server/ingest/recompute.ts";

const updated = await backfillActorHandles();
// eslint-disable-next-line no-console
console.log(`Backfilled handles for ${updated} profiles.`);
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
