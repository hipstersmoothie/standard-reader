/**
 * Database client, reusing the Standard Reader's DATABASE_URL. Server-only (the
 * `.server` suffix keeps the Postgres driver and connection string out of the
 * client bundle). Picks the driver from the connection string the same way the
 * reader does: Neon-style hosts use the serverless HTTP driver, everything else
 * a `pg` pool.
 *
 * `db` is `null` when DATABASE_URL is unset, so the analytics layer can fall
 * back to sample data and the app still runs (dev/demo) without credentials.
 */

import { neon } from "@neondatabase/serverless";
import * as schema from "@standard-reader/db/schema";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type NewsletterDb = NodePgDatabase<typeof schema>;

let cached: NewsletterDb | null | undefined;

function create(): NewsletterDb | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  const isNeon =
    process.env.DB_DRIVER === "neon" ||
    (process.env.DB_DRIVER !== "pg" &&
      /neon\.tech|supabase\.co|vercel-storage\.com/.test(url));

  if (isNeon) {
    return drizzleHttp(neon(url), { schema }) as unknown as NewsletterDb;
  }

  const isLoopback = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_MAX ?? 16),
    ssl: isLoopback ? undefined : { rejectUnauthorized: true },
  });
  return drizzlePg(pool, { schema });
}

export function getDb(): NewsletterDb | null {
  if (cached === undefined) cached = create();
  return cached;
}
