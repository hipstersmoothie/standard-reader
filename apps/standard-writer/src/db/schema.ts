/**
 * Standard Writer's Drizzle schema barrel.
 *
 * The writer runs on the same Neon database as Standard Reader. It owns the
 * `writer_drafts` table (below) and reuses the reader's identity tables
 * (`user` / `session` / `account` / `verification`) for OAuth — imported
 * directly from the reader app so there is a single definition of record.
 * The reader owns migrations for the auth tables; the writer only migrates
 * `writer_drafts` (see `drizzle.config.ts`).
 */
export * from "./schema/drafts.ts";
export {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "../../../standard-reader/src/db/schema/auth.ts";
// Read-model tables the reader owns; the writer reads its author's own
// publications + documents from them (never migrates them).
export { publications } from "../../../standard-reader/src/db/schema/publications.ts";
export { documents } from "../../../standard-reader/src/db/schema/documents.ts";
export { profiles } from "../../../standard-reader/src/db/schema/profiles.ts";
