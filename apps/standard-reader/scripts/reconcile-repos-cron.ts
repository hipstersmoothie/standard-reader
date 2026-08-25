/**
 * PDS reconcile round-robin — the read-model's repair sweep.
 *
 * tap is the primary write path: every create/update/delete streams into the
 * read-model live. This is the backstop for when that fails *silently*, which
 * it does — a tap subscription can stop delivering a repo while still
 * reporting `state: "active"` with no error and no retries, and because "no
 * events" and "no changes" are indistinguishable downstream, nothing in the
 * ingest worker can notice. So we ask each repo's PDS for its head rev,
 * compare it to `last_seen_rev`, and re-mirror anything that drifted.
 *
 * **Why this is its own process.** The sweep used to run inside the ingest
 * worker (a 30-minute timer plus a batch on every hourly recompute). Repairing
 * a repo means enumerating its records and rewriting the changed ones, so that
 * put the repair in direct competition with the live stream it exists to
 * backstop — on a worker already pinned at its in-flight cap. Worse, the two
 * schedules together only managed ~100 repos an hour against a fleet of
 * ~10,000, so a record tap dropped stayed invisible for up to four days.
 * Out here the sweep gets its own process, and the batch is sized from the
 * fleet rather than fixed.
 *
 * **Batch sizing.** A constant can't hold a lap length as the fleet grows, so
 * the batch is derived: one lap is `RECONCILE_LAP_HOURS`, this process runs
 * every `RECONCILE_INTERVAL_HOURS`, so it takes that fraction of the fleet.
 * At the default daily lap, the worst case for an unnoticed missing article
 * goes from ~4 days to ~24 hours.
 *
 * Env:
 *   RECONCILE_LAP_HOURS       hours for one full lap of the fleet (default 24)
 *   RECONCILE_INTERVAL_HOURS  how often this cron fires (default 1)
 *   RECONCILE_BATCH           explicit repo count, skips the derivation
 */

import {
  countReconcilableRepos,
  reconcilePublisherReposBatch,
} from "../src/server/ingest/repo-sync.ts";
import { logEvent } from "../src/server/observability/log.ts";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const lapHours = envNumber("RECONCILE_LAP_HOURS", 24);
const intervalHours = envNumber("RECONCILE_INTERVAL_HOURS", 1);
const tracked = await countReconcilableRepos();
// At least one repo per run: a fleet smaller than the lap divisor would
// otherwise round to zero and the sweep would silently do nothing.
const batch =
  envNumber("RECONCILE_BATCH", 0) ||
  Math.max(1, Math.ceil((tracked * intervalHours) / lapHours));

console.info(
  `[reconcile-cron] ${tracked} tracked repos, ${lapHours}h lap, ${intervalHours}h interval -> batch ${batch}`,
);

const startedAt = Date.now();
try {
  const result = await reconcilePublisherReposBatch(batch);
  const ms = Date.now() - startedAt;
  // `results` holds only the repos that actually enumerated (the rev gate
  // returns early for untouched ones), so it doubles as the changed count.
  logEvent("ingest.reconcileReposCron", {
    attempted: result.attempted,
    batch,
    changed: result.results.length,
    goneMarked: result.goneMarked,
    lapHours,
    migrated: result.migrated,
    ms,
    ok: true,
    prunedDocuments: result.prunedDocuments,
    prunedPublications: result.prunedPublications,
    tracked,
    webBridgeAttempted: result.webBridgeAttempted,
  });
  console.info(
    `[reconcile-cron] attempted=${result.attempted} (webBridge=${result.webBridgeAttempted}) ` +
      `changed=${result.results.length} ` +
      `gone=${result.goneMarked} migrated=${result.migrated} ` +
      `pruned=${result.prunedPublications}p/${result.prunedDocuments}d in ${ms}ms`,
  );
} catch (error: unknown) {
  logEvent("ingest.reconcileReposCron", {
    batch,
    error: error instanceof Error ? error.message : String(error),
    ms: Date.now() - startedAt,
    ok: false,
    tracked,
  });
  throw error;
}

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
