/**
 * One-off: pull every registered labeler's labels and mirror them into the
 * read-model (`document_labels`). The ingest worker runs this automatically on
 * a timer in production (see `startLabelSync`); this script is for local runs
 * and manual refreshes.
 *
 *   pnpm sync-labels
 */

import { db } from "#/db/index";
import * as schema from "#/db/schema";
import { syncAllLabels } from "#/server/labeler/sync.server";

const result = await syncAllLabels(db, schema);
console.log(
  `[sync-labels] synced ${result.labels} label(s) from ${result.labelers} labeler(s)`,
);
process.exit(0);
