/**
 * Scan the AT Protocol network for labelers and add any we don't know about, so
 * the Labelers directory lists what actually exists rather than just what
 * someone here has subscribed to.
 *
 * The ingest worker runs this on a timer in production (see
 * `startLabelerDiscovery`); this script is for local runs and manual refreshes.
 *
 *   pnpm sync-labelers
 */

import { db } from "#/db/index";
import * as schema from "#/db/schema";
import { syncNetworkLabelers } from "#/server/labeler/discover.server";

const startedAt = Date.now();
const result = await syncNetworkLabelers(db, schema);
console.log(
  `[sync-labelers] ${result.discovered} labeler(s) on the network; ` +
    `resolved ${result.attempted}, added ${result.added}, ` +
    `refreshed ${result.refreshed}, ${result.unresolvable} no longer usable ` +
    `(${Math.round((Date.now() - startedAt) / 1000)}s)`,
);
