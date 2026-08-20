import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set");
}

// The guard above narrows `url` at module scope, but that narrowing does not
// reach into the deferred body of `getLockDb`. Bind the checked value once.
const connectionUrl: string = url;

/**
 * The read-model runs on Neon in dev/prod but a plain local Postgres for
 * testing. The `@neondatabase/serverless` HTTP driver only speaks to Neon-style
 * endpoints, so we pick the driver from the connection string (override with
 * `DB_DRIVER=neon|pg`). Both expose the same Drizzle query API.
 */
function isNeonConnection(connectionString: string): boolean {
  const override = process.env.DB_DRIVER;
  if (override === "neon") {
    return true;
  }
  if (override === "pg") {
    return false;
  }
  return /neon\.tech|supabase\.co|vercel-storage\.com/i.test(connectionString);
}

/** Read a positive integer from the environment, falling back when unset/invalid. */
function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Build a `pg` Pool for the node-postgres driver (local tests + the
 * long-running ingest worker via `DB_DRIVER=pg`). The worker processes events
 * concurrently, so size the pool for that; Neon's pooler (pgbouncer) endpoint
 * multiplexes these onto far fewer Postgres backends. Loopback connections run
 * without TLS; everything else (Neon) uses SSL with full certificate
 * verification (`rejectUnauthorized: true`). Neon's certificates are signed
 * by DigiCert, which is in Node's default trust store.
 *
 * `connectionTimeoutMillis` is not optional: node-postgres queues acquires
 * FOREVER by default, so a drained pool degrades into multi-minute request
 * hangs that raise no error and still answer 200 — invisible in error rates and
 * indistinguishable from "the site doesn't load". Failing fast turns pool
 * exhaustion into something a dashboard can actually see.
 */
function createPgPool(
  connectionString: string,
  options: { max: number; connectionTimeoutMillis: number },
): Pool {
  const isLocal = /@(localhost|127\.0\.0\.1|::1)[:/]/.test(connectionString);
  return new Pool({
    connectionString,
    max: options.max,
    connectionTimeoutMillis: options.connectionTimeoutMillis,
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
  });
}

/**
 * True when the active driver is the Neon serverless HTTP driver, which has no
 * transaction support (`db.transaction` throws). Callers that need real
 * transactions — e.g. the advisory-lock refresh serializer in
 * `src/integrations/auth/db-lock.server.ts` — branch on this. The app runs on
 * the node-postgres pool (`DB_DRIVER=pg`) in dev and prod, so this is normally
 * false; it only trips if someone forces the HTTP driver.
 */
export const isNeonHttpDriver: boolean = isNeonConnection(url);

// Pin a single concrete type so downstream code has one stable `db` type. The
// two drivers share the same query-builder API at runtime; the Neon branch is
// cast to match (execute() results differ only in wrapper, both expose `rows`).
export const db: NodePgDatabase<typeof schema> = isNeonHttpDriver
  ? (drizzleHttp({ client: neon(url), schema }) as unknown as NodePgDatabase<
      typeof schema
    >)
  : drizzleNode({
      client: createPgPool(url, {
        max: envInt("DB_POOL_MAX", 16),
        connectionTimeoutMillis: envInt("DB_POOL_ACQUIRE_TIMEOUT_MS", 5000),
      }),
      schema,
    });

/**
 * A second, small pool reserved for the OAuth refresh advisory lock.
 *
 * `withAdvisoryLock` (see `src/integrations/auth/db-lock.server.ts`) holds its
 * connection across the PDS token-refresh round trip — a network call to an
 * arbitrary third-party server that atcute only bounds at 30s. Run on the
 * shared pool, sixteen concurrent slow refreshes drain it, and every unrelated
 * signed-in read then parks in the acquire queue behind them. Isolating those
 * long holds here means a slow PDS can stall refreshes but never ordinary
 * request traffic.
 *
 * Sized small on purpose: refreshes already serialize per-DID in-process, so
 * this only needs enough slots for distinct DIDs refreshing at once. The
 * acquire timeout is generous relative to the request pool because atcute
 * aborts the whole session get at 30s anyway, and because a failed acquire here
 * surfaces as a plain error — `deleteOnError` returns false, so the stored
 * session survives and the reader stays logged in.
 *
 * Created lazily so nothing opens a second pool under the neon-http driver or
 * in tests that never take the lock.
 */
let lockDbInstance: NodePgDatabase<typeof schema> | undefined;

export function getLockDb(): NodePgDatabase<typeof schema> {
  lockDbInstance ??= drizzleNode({
    client: createPgPool(connectionUrl, {
      max: envInt("DB_LOCK_POOL_MAX", 8),
      connectionTimeoutMillis: envInt("DB_LOCK_ACQUIRE_TIMEOUT_MS", 20_000),
    }),
    schema,
  });
  return lockDbInstance;
}
