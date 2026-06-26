/**
 * Standard Reader read-model schema (Neon Postgres, Drizzle).
 *
 * This is a derived cache of the AT Protocol network, fed by the `tap` instance
 * (see `tap/` + `src/server/ingest/`). The canonical records always live in each
 * author's / reader's repo — never here.
 *
 * Tables mirror the standard.site lexicons (publications, documents, the
 * subscription + recommend graph), plus identity/profile data backfilled from
 * Bluesky, derived aggregates for trending/recommendations, and ingestion
 * bookkeeping. Split into modules under `./schema/` and re-exported here so the
 * Drizzle client (`./index.ts`) and `drizzle.config.ts` see every table.
 */
export * from "./schema/auth.ts";
export * from "./schema/profiles.ts";
export * from "./schema/publications.ts";
export * from "./schema/documents.ts";
export * from "./schema/graph.ts";
export * from "./schema/personal.ts";
export * from "./schema/lists.ts";
export * from "./schema/stats.ts";
export * from "./schema/ingest.ts";
export * from "./schema/labels.ts";
export * from "./schema/quote-shares.ts";
export * from "./schema/relations.ts";
