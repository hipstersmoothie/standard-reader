import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * App-owned publication-list records, mirrored from the reader's repo by the
 * tap ingester. Previously fetched directly from the PDS on every shell load
 * — now synced here so the shell snapshot never blocks on PDS I/O.
 *
 *   - `app.standard-reader.list`     — a named, ordered list of publications (`lists`).
 *   - `app.standard-reader.listSave` — another reader's list saved into this app (`list_saves`).
 *
 * Keyed by the record AT-URI so ingest upserts/deletes are idempotent.
 */

/**
 * `app.standard-reader.list` — a named, ordered, shareable publication list
 * authored by a reader. The `publications` array holds ordered at-uris of
 * `site.standard.publication` records.
 */
export const lists = pgTable(
  "lists",
  {
    /** AT-URI of the list record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the reader who authored this list (the repo that holds it). */
    ownerDid: text("owner_did").notNull(),
    rkey: text("rkey").notNull(),

    name: text("name").notNull(),
    description: text("description"),
    /** Ordered at-uris of `site.standard.publication` records in the list. */
    publications: jsonb("publications").notNull().default([]),

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
    // A reader's own lists (sidebar groups).
    index("lists_owner_idx").on(table.ownerDid, table.rkey),
  ],
);

export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;

/**
 * `app.standard-reader.listSave` — a reader has saved another reader's list,
 * acting like a subscription to every publication in that list. The `listUri`
 * points at an `app.standard-reader.list` record (which may live in a
 * different repo).
 */
export const listSaves = pgTable(
  "list_saves",
  {
    /** AT-URI of the listSave record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the reader who saved the list (the repo that holds this record). */
    saverDid: text("saver_did").notNull(),
    rkey: text("rkey").notNull(),

    /** AT-URI of the saved `app.standard-reader.list` record. */
    listUri: text("list_uri").notNull(),
    /** DID extracted from `listUri` (the list owner). */
    listOwnerDid: text("list_owner_did"),

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
    // A reader's saved lists (effective follow expansion).
    index("list_saves_saver_idx").on(table.saverDid),
    // Look up a list by its URI (join from list_saves → lists).
    index("list_saves_list_uri_idx").on(table.listUri),
  ],
);

export type ListSave = typeof listSaves.$inferSelect;
export type NewListSave = typeof listSaves.$inferInsert;
