import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * App-owned personal-state records, written back to the reader's own repo and
 * mirrored here by the tap ingester. These are the source-of-truth-is-the-repo,
 * cached-here records from `APP_VISION.md` §5:
 *
 *   - `app.standard-reader.read`     — an article marked read (`reads`).
 *   - `app.standard-reader.bookmark` — an article saved for later (`bookmarks`).
 *
 * Reads reference a `site.standard.document` by AT-URI (`subject`). Follows
 * reuse standard.site's `site.standard.graph.subscription` and live in
 * `./graph.ts`. Keyed by the record AT-URI so ingest upserts/deletes are
 * idempotent.
 */

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

export type Read = typeof reads.$inferSelect;
export type NewRead = typeof reads.$inferInsert;

/** `app.standard-reader.bookmark` records — articles a reader saved for later. */
export const bookmarks = pgTable(
  "bookmarks",
  {
    /** AT-URI of the bookmark record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the reader (the repo that holds this record). */
    ownerDid: text("owner_did").notNull(),
    rkey: text("rkey").notNull(),

    /** AT-URI of the saved `site.standard.document` (required). */
    documentUri: text("document_uri").notNull(),
    /** DID extracted from `documentUri`. */
    documentDid: text("document_did"),

    /** `createdAt` from the record (when the article was saved). */
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
    index("bookmarks_owner_idx").on(table.ownerDid, table.createdAt.desc()),
    index("bookmarks_document_idx").on(table.documentUri),
    index("bookmarks_edge_idx").on(table.ownerDid, table.documentUri),
  ],
);

export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;

/**
 * `app.standard-reader.sidebarPref` records — a reader's sidebar list ordering
 * and collapsed-group preferences. A singleton per reader (rkey `self`), so
 * this mirror is keyed by `ownerDid` rather than the record AT-URI.
 */
export const sidebarPrefs = pgTable("sidebar_prefs", {
  /** DID of the reader (the repo that holds this record). */
  ownerDid: text("owner_did").primaryKey(),
  /** AT-URI of the sidebarPref record (`.../app.standard-reader.sidebarPref/self`). */
  uri: text("uri").notNull(),
  cid: text("cid"),
  rkey: text("rkey").notNull(),

  /** Ordered at-uris of the reader's list groups (own + saved). */
  listOrder: jsonb("list_order").notNull().default([]),
  /** At-uris of the list groups the reader has collapsed. */
  collapsed: jsonb("collapsed").notNull().default([]),

  /** `updatedAt` from the record. */
  updatedAt: timestamp("updated_at", { withTimezone: true }),

  deleted: boolean("deleted").notNull().default(false),

  indexedAt: timestamp("indexed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SidebarPref = typeof sidebarPrefs.$inferSelect;
export type NewSidebarPref = typeof sidebarPrefs.$inferInsert;
