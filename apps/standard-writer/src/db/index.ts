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
 * Same connection strategy as Standard Reader: the Neon serverless HTTP driver
 * for Neon endpoints, a `pg` Pool otherwise (local Postgres in tests, or
 * `DB_DRIVER=pg`). Both expose the same Drizzle query API.
 */
function isNeonConnection(connectionString: string): boolean {
  const override = process.env.DB_DRIVER;
  if (override === "neon") return true;
  if (override === "pg") return false;
  return /neon\.tech|supabase\.co|vercel-storage\.com/i.test(connectionString);
}

function createPgPool(connectionString: string): Pool {
  const isLocal = /@(localhost|127\.0\.0\.1|::1)[:/]/.test(connectionString);
  const max = Number(process.env.DB_POOL_MAX);
  return new Pool({
    connectionString,
    max: Number.isFinite(max) && max > 0 ? max : 16,
    ssl: isLocal ? undefined : { rejectUnauthorized: true },
  });
}

export const isNeonHttpDriver: boolean = isNeonConnection(url);

export const db: NodePgDatabase<typeof schema> = isNeonHttpDriver
  ? (drizzleHttp({ client: neon(url), schema }) as unknown as NodePgDatabase<
      typeof schema
    >)
  : drizzleNode({ client: createPgPool(url), schema });
