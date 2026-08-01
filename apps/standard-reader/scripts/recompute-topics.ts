/* eslint-disable no-console -- this script's whole output is its console report */
/**
 * Run the topic derivation pass on its own and persist the result.
 *
 * The same pass the hourly sweep runs (`recomputeDerived`), exposed separately
 * so it can be triggered and inspected without waiting for a sweep — useful
 * right after a deploy that changes the clustering, and for checking that a
 * second run leaves slugs alone.
 *
 *   pnpm topics:recompute
 *
 * Writes. For a read-only look at what would be published, use
 * `pnpm topics:derive`.
 */
import { recomputeTopics } from "../src/server/ingest/recompute-topics.ts";

const started = Date.now();
const summary = await recomputeTopics();

console.log({ ...summary, elapsedMs: Date.now() - started });

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
/* eslint-enable no-console */
