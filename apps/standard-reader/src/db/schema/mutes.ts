import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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

/**
 * Muted words — words and phrases a reader never wants to see in a feed.
 *
 * **Deliberately not an AT Proto record**, unlike {@link mutes}. A muted
 * account is a statement about someone else; a muted-word list is a statement
 * about the reader ("I can't read about elections right now"), and publishing
 * it to the firehose isn't something they opted into by typing a word in
 * settings. Bluesky keeps its muted words in private preferences for the same
 * reason. So this lives only here, keyed by DID — it follows the reader across
 * devices, but not to another client (the `reading_progress` trade-off).
 *
 * A word hides articles whose title or description contains it, and
 * publications whose name or description does; see `lib/muted-words.ts` for
 * the matching rules. `pattern` is the Postgres ARE derived from `word` at
 * write time (`mutedWordPostgresPattern`), so feed SQL can fold a reader's
 * whole list into one alternation with a single index probe.
 */
export const mutedWords = pgTable(
  "muted_words",
  {
    /** DID of the reader. No FK to `user`, matching `reading_progress`. */
    ownerDid: text("owner_did").notNull(),
    /** The word, normalized (`normalizeMutedWord`) — the uniqueness key. */
    word: text("word").notNull(),
    /** Postgres ARE for {@link word}, applied with `~*`. */
    pattern: text("pattern").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.ownerDid, table.word] })],
);

export type MutedWord = typeof mutedWords.$inferSelect;
