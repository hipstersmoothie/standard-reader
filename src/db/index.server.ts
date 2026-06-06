/**
 * Server-only entry point for the Drizzle client. The `.server.ts` suffix keeps
 * the Postgres/Neon drivers (and `DATABASE_URL`) out of any client bundle, even
 * when auth route modules statically import `db`. Re-exports the singleton from
 * `./index.ts` so there is still exactly one client instance.
 */
export { db } from "./index.ts";
