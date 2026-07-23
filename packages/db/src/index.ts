/**
 * `@standard-reader/db` — the shared read-model schema for the Standard apps.
 *
 * This is the single source of truth for the Postgres/Drizzle table
 * definitions. Both the reader and the newsletter import it so they read the
 * same physical database. Each app keeps its own Drizzle client (connection
 * policy differs — the reader throws when DATABASE_URL is unset; the newsletter
 * falls back to sample data), but the schema lives here.
 */
export * from "./schema.ts";
