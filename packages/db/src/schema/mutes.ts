import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Mutes — mirrored `app.standard-reader.graph.mute` records.
 *
 * One row per record in the muter's repo. A mute hides the subject from the
 * reader's feeds and discovery surfaces only: direct navigation still works and
 * subscriptions are untouched. Unlike {@link blocks} it is strictly
 * one-directional — being muted by someone never hides *their* content from
 * you — so there is no incoming half to mirror.
 *
 * The record's `subject` is either a user DID or the AT-URI of a
 * `site.standard.publication`. The raw value is kept in `subject`, and ingest
 * classifies it into exactly one of `subjectDid` / `subjectUri` so feed SQL
 * correlates on an indexed column instead of a string-prefix test.
 */
export const mutes = pgTable(
  "mutes",
  {
    /** AT-URI of the `app.standard-reader.graph.mute` record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the muter (the repo that holds this record). */
    muterDid: text("muter_did").notNull(),
    rkey: text("rkey").notNull(),

    /** The record's raw `subject` — a user DID or a publication AT-URI. */
    subject: text("subject").notNull(),
    /** DID of the muted user; set iff this is a user mute. */
    subjectDid: text("subject_did"),
    /** AT-URI of the muted publication; set iff this is a publication mute. */
    subjectUri: text("subject_uri"),

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
    // "does this reader have any mutes" gate + the settings listing.
    index("mutes_muter_idx").on(table.muterDid),
    // Per-candidate probe: is this author / publication owner muted by the
    // viewer. Serves the user-mute `NOT EXISTS` branches in feed queries and
    // the single-edge mute-state lookup.
    index("mutes_user_edge_idx").on(table.muterDid, table.subjectDid),
    // Per-candidate probe: is this publication muted by the viewer.
    index("mutes_pub_edge_idx").on(table.muterDid, table.subjectUri),
  ],
);

export type Mute = typeof mutes.$inferSelect;
export type NewMute = typeof mutes.$inferInsert;
