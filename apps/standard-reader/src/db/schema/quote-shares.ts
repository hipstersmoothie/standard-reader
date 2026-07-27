import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Ephemeral quote highlights for share links (`/a/:did/:rkey?q=:id`).
 * Stores the selected excerpt so URLs stay short and stable.
 */
export const quoteShares = pgTable(
  "quote_shares",
  {
    /** Short deterministic id (hash prefix) used in share URLs. */
    id: text("id").primaryKey(),
    /** AT-URI of the highlighted `site.standard.document`. */
    documentUri: text("document_uri").notNull(),
    quoteText: text("quote_text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("quote_shares_document_uri_idx").on(table.documentUri)],
);
