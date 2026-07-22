/**
 * Server-only entry point for the Drizzle client. The `.server.ts` suffix keeps
 * the Postgres/Neon drivers (and `DATABASE_URL`) out of any client bundle even
 * when route modules statically import `db`.
 */
export { db, isNeonHttpDriver } from "./index.ts";
