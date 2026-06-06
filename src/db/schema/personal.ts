import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * App-owned personal-state records, written back to the reader's own repo and
 * mirrored here by the tap ingester. These are the source-of-truth-is-the-repo,
 * cached-here records from `APP_VISION.md` §5:
 *
 *   - `app.standard-reader.bookmark` — a saved article (`bookmarks`).
 *   - `app.standard-reader.read`     — an article marked read (`reads`).
 *
 * Both reference a `site.standard.document` by AT-URI (`subject`). Follows reuse
 * standard.site's `site.standard.graph.subscription` and live in `./graph.ts`.
 * Keyed by the record AT-URI so ingest upserts/deletes are idempotent.
 */

/** `app.standard-reader.bookmark` records — a reader's saved articles. */
export const bookmarks = pgTable(
  "bookmarks",
  {
    /** AT-URI of the bookmark record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the reader who saved it (the repo that holds this record). */
    ownerDid: text("owner_did").notNull(),
    rkey: text("rkey").notNull(),

    /** AT-URI of the bookmarked `site.standard.document` (required). */
    documentUri: text("document_uri").notNull(),
    /** DID extracted from `documentUri` (useful before the document is indexed). */
    documentDid: text("document_did"),

    /** `createdAt` from the record. */
    createdAt: timestamp("created_at", { withTimezone: true }),

    deleted: boolean("deleted").notNull().default(false),

    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // A reader's bookmark list (saved view), newest first.
    index("bookmarks_owner_idx").on(table.ownerDid, table.createdAt.desc()),
    // Fan-out / "who bookmarked this article".
    index("bookmarks_document_idx").on(table.documentUri),
    // Look up a single (reader → document) edge for save-status toggles.
    index("bookmarks_edge_idx").on(table.ownerDid, table.documentUri),
  ],
);

/** `app.standard-reader.read` records — articles a reader has opened/read. */
export const reads = pgTable(
  "reads",
  {
    /** AT-URI of the read record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the reader (the repo that holds this record). */
    ownerDid: text("owner_did").notNull(),
    rkey: text("rkey").notNull(),

    /** AT-URI of the read `site.standard.document` (required). */
    documentUri: text("document_uri").notNull(),
    /** DID extracted from `documentUri`. */
    documentDid: text("document_did"),

    /** `createdAt` from the record (when the article was read). */
    createdAt: timestamp("created_at", { withTimezone: true }),

    deleted: boolean("deleted").notNull().default(false),

    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // A reader's read/unread filtering for the Latest feed.
    index("reads_owner_idx").on(table.ownerDid, table.createdAt.desc()),
    index("reads_document_idx").on(table.documentUri),
    // Single (reader → document) edge for read-status checks.
    index("reads_edge_idx").on(table.ownerDid, table.documentUri),
  ],
);

export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
export type Read = typeof reads.$inferSelect;
export type NewRead = typeof reads.$inferInsert;
