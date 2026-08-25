import {
  index,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * How far a reader got through an article — deliberately **not** an AT Proto
 * record.
 *
 * Every other personal-state table in `./personal.ts` mirrors a record in the
 * reader's own repo, and those records are public (`APP_VISION.md` §5): anyone
 * can see what you read. Position is a different kind of fact. "I stopped 20%
 * into this" is a running commentary on attention, and publishing it to the
 * firehose is not something a reader opted into by opening an article. So this
 * lives only here, private to the app, and the tap never writes it.
 *
 * The trade is that progress is app-local rather than portable — it follows the
 * reader across their devices (it is keyed by DID, not by browser) but does not
 * travel with the repo to another client.
 */
export const readingProgress = pgTable(
  "reading_progress",
  {
    /** DID of the reader. No FK to `user`: the DID outlives any one session
     * row, matching `push_devices` / `push_topics`. */
    ownerDid: text("owner_did").notNull(),
    /** AT-URI of the `site.standard.document` being read. */
    documentUri: text("document_uri").notNull(),

    /**
     * Fraction of the article body scrolled past, 0–1. A fraction rather than a
     * pixel offset because the same reader's phone and laptop disagree on every
     * pixel — column width, text-size dial, and font all differ — but they
     * agree on "a third of the way in".
     */
    progress: real("progress").notNull(),

    /** When the reader was last at this position. */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.ownerDid, table.documentUri] }),
    // "Continue reading" — a reader's in-progress articles, most recent first.
    index("reading_progress_owner_idx").on(
      table.ownerDid,
      table.updatedAt.desc(),
    ),
  ],
);

export type ReadingProgress = typeof readingProgress.$inferSelect;
export type NewReadingProgress = typeof readingProgress.$inferInsert;
