import { db } from "#/db/index";
import * as schema from "#/db/schema";
import { syncAllLabels } from "#/server/labeler/sync.server";
const t0 = Date.now();
const r = await syncAllLabels(db, schema);
console.log(
  `RESULT labelers=${r.labelers} labels=${r.labels} in ${Math.round((Date.now() - t0) / 1000)}s`,
);
