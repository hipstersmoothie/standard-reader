/**
 * Cross-process serialization for atcute's OAuth token refresh, passed to
 * `OAuthClient` as its `requestLock`.
 *
 * AT Proto refresh tokens are single-use: the PDS rotates the refresh token on
 * every refresh and rejects the previous one with `invalid_grant`. atcute's
 * `SessionGetter` wraps each session read in `requestLock("oauth-session-<did>",
 * fn)` and, on `invalid_grant`, DELETES the stored session — which logs the
 * user out. Without a cross-process lock, two processes (a deploy's old + new
 * instance overlapping, multiple replicas, or the ingest worker) can refresh
 * the same session concurrently: one wins the rotation, the loser gets
 * `invalid_grant`, and its stored session is deleted.
 *
 * This lock serializes refreshes so the loser instead re-reads the winner's
 * freshly-rotated tokens — atcute re-reads the store INSIDE the locked callback
 * and skips the refresh when the token is no longer stale.
 *
 * Two layers:
 *  1. An in-process promise queue per key, so many concurrent callers in one
 *     process serialize locally instead of each checking out a pool connection
 *     to block on the same advisory lock. (This also restores the in-process
 *     mutual exclusion atcute would otherwise get from its default lock.)
 *  2. A transaction-scoped Postgres advisory lock (`pg_advisory_xact_lock`) for
 *     cross-process mutual exclusion. It auto-releases on
 *     commit/rollback/disconnect, so a crashed process can never strand a lock,
 *     and being transaction-scoped it is safe under transaction-pooled
 *     connections (Neon pooler / pgbouncer).
 */
import { sql } from "drizzle-orm";

import { db, isNeonHttpDriver } from "#/db/index.server";
import { logEvent } from "#/server/observability/log";

/**
 * Bounds how long a caller waits to acquire the advisory lock. atcute aborts
 * the whole session get at 30s (`AbortSignal.timeout(30_000)`), so the wait
 * plus the refresh round trip must fit inside that. On timeout Postgres raises
 * a plain error — NOT one of atcute's `Token*Error` classes — so `deleteOnError`
 * returns false and the stored session survives (the request fails, but the
 * user stays logged in). We must never fall through and run `fn` unlocked.
 */
const LOCK_TIMEOUT = "15s";

/**
 * Emit a telemetry event once the acquire wait crosses this — i.e. we actually
 * blocked on another holder. A steady stream of these in prod is the positive
 * signal that the lock is doing its job (serializing concurrent refreshes that
 * previously raced into a logout); a sudden spike points at refresh storms.
 */
const CONTENTION_LOG_THRESHOLD_MS = 250;

let warnedNoTransactions = false;

async function withAdvisoryLock<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (isNeonHttpDriver) {
    // The neon-http driver has no transaction support, so we can't hold an
    // advisory lock across the refresh. Fall back to in-process-only
    // serialization (atcute's pre-existing behavior) rather than crashing every
    // restore. Only reachable when someone forces DB_DRIVER=neon.
    if (!warnedNoTransactions) {
      warnedNoTransactions = true;
      logEvent("auth.oauth.refresh_lock_unavailable", {
        reason: "neon-http-no-transactions",
      });
    }
    return await fn();
  }

  return await db.transaction(async (tx) => {
    // LOCAL so the setting reverts when the transaction ends. LOCK_TIMEOUT is a
    // hardcoded constant, so interpolating it is safe (SET rejects bind params
    // for its value anyway).
    await tx.execute(sql.raw(`set local lock_timeout = '${LOCK_TIMEOUT}'`));

    const waitStart = performance.now();
    try {
      // hashtextextended(text, bigint) -> bigint gives the lock key from the DID.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${name}, 0))`,
      );
    } catch (error: unknown) {
      // Timed out (or otherwise failed) acquiring the lock. This is a plain
      // Postgres error, NOT one of atcute's Token*Error classes, so
      // `deleteOnError` returns false and the stored session survives — the
      // request fails but the user stays logged in.
      logEvent("auth.oauth.refresh_lock_timeout", {
        lock: name,
        waited_ms: Math.round(performance.now() - waitStart),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const waitedMs = Math.round(performance.now() - waitStart);
    if (waitedMs >= CONTENTION_LOG_THRESHOLD_MS) {
      logEvent("auth.oauth.refresh_lock_contended", {
        lock: name,
        waited_ms: waitedMs,
      });
    }

    return await fn();
  });
}

/**
 * Per-key promise chain. Serializes callers within this process before they
 * contend on the DB advisory lock. The tail promise (what the next caller
 * awaits) never rejects, so one failed refresh doesn't break the chain for
 * subsequent callers.
 */
const localChains = new Map<string, Promise<unknown>>();

/** Settles the tail promise without propagating a value or rejection. */
function noop(): void {}

/** atcute `LockFunction`: `<T>(name, fn) => Promise<T>`. */
export function dbRequestLock<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = localChains.get(name) ?? Promise.resolve();
  const runNext = (): Promise<T> => withAdvisoryLock(name, fn);
  const run = prev.then(runNext, runNext);
  // The tail the next caller awaits: resolves regardless of this call's outcome,
  // so one failed refresh never breaks the chain for subsequent callers.
  const tail = run.then(noop, noop);
  localChains.set(name, tail);
  // Drop the map entry once this is the last queued caller, so keys for idle
  // DIDs don't accumulate.
  void tail.finally(() => {
    if (localChains.get(name) === tail) {
      localChains.delete(name);
    }
  });
  return run;
}
