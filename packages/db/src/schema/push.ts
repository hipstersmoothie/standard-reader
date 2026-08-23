import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Web push notifications — "tell me when this publication / author posts".
 *
 * Unlike almost everything else in `./schema/`, these tables are NOT a mirror of
 * the network. They are app-owned state with no AT Proto record behind them:
 *
 *   - `push_devices` holds a browser's push endpoint and its encryption keys.
 *     Those are per-browser secrets — anyone holding them can send that browser
 *     a notification — so they must never be written to a public repo.
 *   - `push_topics` (the per-source opt-in) *could* have been a record, the way
 *     `app.standard-reader.sidebarPref` is. It isn't, because a new record
 *     collection means an expanded OAuth write scope, and every existing session
 *     would have to go through the "reconnect your account" flow before the bell
 *     worked at all. If the opt-in ever needs to be portable, a record + mirror
 *     can be layered on top of this table.
 *   - `document_push_queue` is the send outbox. See its doc comment — it is also
 *     the exactly-once claim, and that is why it is a table and not a column.
 */

/**
 * One row per browser/profile that granted notification permission. Keyed by
 * `endpoint` because that IS the identity of a push subscription: the browser
 * hands us the same endpoint on re-subscribe, and a rotated endpoint is by
 * definition a different destination.
 */
export const pushDevices = pgTable(
  "push_devices",
  {
    /** Push service URL the payload is delivered to. */
    endpoint: text("endpoint").primaryKey(),
    /** DID of the reader this browser is signed in as. */
    ownerDid: text("owner_did").notNull(),

    /** Keys from `PushSubscription.toJSON().keys`, for RFC 8291 encryption. */
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),

    /** Raw UA string, so settings can name the device ("Chrome on macOS"). */
    userAgent: text("user_agent"),

    /** Bumped on a transient send failure; reset on success. Purely
     * diagnostic — a dead endpoint is deleted outright on 404/410. */
    failureCount: integer("failure_count").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Refreshed every time the browser re-registers, so stale rows are
     * identifiable even when the push service never returns 410. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("push_devices_owner_idx").on(table.ownerDid)],
);

/** What a reader wants to be notified about. */
export const PUSH_SUBJECT_TYPES = ["publication", "author"] as const;
export type PushSubjectType = (typeof PUSH_SUBJECT_TYPES)[number];

/**
 * One row per (reader → source) opt-in. Deliberately independent of
 * `subscriptions` / `user_follows`: turning on notifications does not change
 * your feed, and you do not have to subscribe to be notified.
 *
 * `subject` is a publication AT-URI (`subject_type = 'publication'`) or an
 * author DID (`subject_type = 'author'`).
 */
export const pushTopics = pgTable(
  "push_topics",
  {
    ownerDid: text("owner_did").notNull(),
    subjectType: text("subject_type").notNull(),
    subject: text("subject").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.ownerDid, table.subjectType, table.subject],
    }),
    // Fan-out: given a new document, who asked about this publication/author?
    index("push_topics_subject_idx").on(table.subjectType, table.subject),
  ],
);

/** Lifecycle of a queued document notification. */
export const PUSH_QUEUE_STATES = [
  "pending",
  "sending",
  "sent",
  "failed",
] as const;
export type PushQueueState = (typeof PUSH_QUEUE_STATES)[number];

/**
 * Send outbox for new-post notifications — and the exactly-once claim.
 *
 * The tap handler inserts here (`ON CONFLICT DO NOTHING`) when it indexes a
 * genuinely new document; the push cron drains it. Being a queue *and* the claim
 * is the point: the primary key is what makes tap redelivery, dead-letter
 * replay, and a later `update` event for the same document all no-ops.
 *
 * Two things about the shape are deliberate:
 *
 *   1. **No foreign key to `documents`.** Document deletes are hard deletes
 *      (`deleteRecord` in `server/ingest/handlers.ts` does `db.delete(documents)`,
 *      not a tombstone), so an FK — or the obvious alternative, a
 *      `documents.push_notified_at` column — would let the claim die with the
 *      row. A delete→recreate at the same rkey is a normal republish, and it
 *      would re-notify everyone.
 *   2. **Not a column on `documents`** for the same reason, plus a second one:
 *      `upsertDocument` writes `onConflictDoUpdate({ set: values })` with
 *      `values` as a literal object, so any column that must survive an update
 *      has to be kept out of it — with nothing in the code to say so.
 *
 * `sent` / `failed` rows are pruned by age from the hourly recompute sweep.
 */
export const documentPushQueue = pgTable(
  "document_push_queue",
  {
    /** AT-URI of the document to notify about. */
    documentUri: text("document_uri").primaryKey(),
    /** Author DID, denormalized so the drain doesn't need `documents` to
     * apply the per-author flood cap. */
    authorDid: text("author_did").notNull(),

    /** `pending` | `sending` | `sent` | `failed` (see PUSH_QUEUE_STATES). */
    state: text("state").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    /** Not eligible for a claim before this — pushed forward by `Retry-After`
     * on a 429. */
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** When the current `sending` claim was taken. A run killed mid-send leaves
     * this stale, which is how the next run's reaper finds it. */
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    /** Last failure, kept for inspecting `failed` rows. */
    lastError: text("last_error"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The drain's claim query: pending-and-due, oldest first.
    index("document_push_queue_claim_idx").on(
      table.state,
      table.availableAt,
      table.createdAt,
    ),
    // The per-author flood cap counts recent sends for one DID.
    index("document_push_queue_author_idx").on(
      table.authorDid,
      table.createdAt,
    ),
  ],
);

export type PushDevice = typeof pushDevices.$inferSelect;
export type NewPushDevice = typeof pushDevices.$inferInsert;
export type PushTopic = typeof pushTopics.$inferSelect;
export type NewPushTopic = typeof pushTopics.$inferInsert;
export type DocumentPushQueueRow = typeof documentPushQueue.$inferSelect;
export type NewDocumentPushQueueRow = typeof documentPushQueue.$inferInsert;
