/**
 * `@standard-reader/db` — the shared read-model schema for the Standard apps.
 *
 * The single source of truth for the Postgres/Drizzle table definitions.
 * Standard Reader and Standard Writer both import it so they read one physical
 * database and can never disagree about its shape. Each app keeps its own
 * Drizzle client, because connection policy differs between them; only the
 * schema lives here.
 *
 * Migration generation stays with the reader (`pnpm db:generate`), which owns
 * `drizzle/` — one journal for one database.
 */
export * from "./schema.ts";
