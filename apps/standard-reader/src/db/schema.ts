/**
 * The reader's view of the shared read-model schema.
 *
 * The tables themselves live in `@standard-reader/db` so Standard Reader and
 * Standard Writer read one physical database from one definition. This barrel
 * exists so the reader's own `#/db/schema` imports — several hundred of them,
 * plus `drizzle.config.ts` — keep working unchanged, and so there is still one
 * obvious place to look from inside this app.
 *
 * Migration generation stays here: `pnpm db:generate` reads this file, and
 * `drizzle/` is the single journal for the single database. A table added in
 * the package is migrated from the reader.
 */
export * from "@standard-reader/db/schema";
