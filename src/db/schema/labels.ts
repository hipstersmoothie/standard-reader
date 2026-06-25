import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Per-label visibility a reader has chosen for a labeler's label value. */
export type LabelVisibility = "ignore" | "warn" | "hide";
export interface LabelPref {
  val: string;
  visibility: LabelVisibility;
}

/**
 * `app.standard-reader.labelerSubscription` records — which labeler services a
 * reader has subscribed to (like Bluesky's subscribed moderation services).
 *
 * Keyed by the record AT-URI. Required lexicon field: `labeler` (a DID). This is
 * a read-model mirror of records the reader writes to their own repo; it lets
 * the app filter labels to a reader's subscribed labelers without a repo read.
 */
export const labelerSubscriptions = pgTable(
  "labeler_subscriptions",
  {
    /** AT-URI of the labelerSubscription record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the subscriber (the repo that holds this record). */
    subscriberDid: text("subscriber_did").notNull(),
    rkey: text("rkey").notNull(),

    /** DID of the subscribed-to labeler service (required). */
    labelerDid: text("labeler_did").notNull(),

    /** Per-label visibility overrides (mirrors the record's `labels`). */
    prefs: jsonb("prefs").$type<Array<LabelPref>>(),

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
    // A given reader's subscribed labelers (settings page, label filtering).
    index("labeler_subscriptions_subscriber_idx").on(table.subscriberDid),
    // Subscriber count per labeler.
    index("labeler_subscriptions_labeler_idx").on(table.labelerDid),
  ],
);

export type LabelerSubscription = typeof labelerSubscriptions.$inferSelect;
export type NewLabelerSubscription = typeof labelerSubscriptions.$inferInsert;
