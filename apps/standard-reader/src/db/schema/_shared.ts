import { customType } from "drizzle-orm/pg-core";

/**
 * Postgres `tsvector` column type for full-text search. Drizzle has no built-in
 * type, so we declare a thin custom type and populate it via a generated column
 * (see `documents.searchVector` / `publications.searchVector`).
 */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});
