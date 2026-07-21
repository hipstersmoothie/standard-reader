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

/**
 * Build the `pg` Pool used by the node-postgres driver (local tests + the
 * long-running ingest worker via `DB_DRIVER=pg`). The worker processes events
 * concurrently, so size the pool for that; Neon's pooler (pgbouncer) endpoint
 * multiplexes these onto far fewer Postgres backends. Loopback connections run
 * without TLS; everything else (Neon) uses SSL with full certificate
 * verification (`rejectUnauthorized: true`). Neon's certificates are signed
 * by DigiCert, which is in Node's default trust store.
 */
function createPgPool(connectionString: string): Pool {
  const isLocal = /@(localhost|127\.0\.0\.1|::1)[:/]/.test(connectionString);
  const max = Number(process.env.DB_POOL_MAX);
  return new Pool({
    connectionString,
    max: Number.isFinite(max) && max > 0 ? max : 16,
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
  : drizzleNode({ client: createPgPool(url), schema });
