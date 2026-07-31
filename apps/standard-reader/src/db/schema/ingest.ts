import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Ingestion bookkeeping for the `tap` → Neon pipeline.
 *
 * `tap` itself owns the firehose cursor and per-repo backfill state (in its own
 * SQLite/Postgres store) and delivers at-least-once. These tables give *our*
 * consumer idempotency, observability, and a way to drive `tap`'s dynamic repo
 * tracking (`/repos/add`).
 */

/**
 * Singleton-ish consumer checkpoint. We process tap events keyed by their
 * monotonic `id`; storing the high-water mark lets us drop duplicates from
 * at-least-once redelivery and expose lag/throughput.
 */
export const ingestState = pgTable("ingest_state", {
  /** Logical stream id (default `"tap"`). */
  id: text("id").primaryKey(),
  /** Highest tap event `id` we've durably processed. */
  lastEventId: bigint("last_event_id", { mode: "number" }),
  /** Wall-clock time of the last processed event. */
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  /** Total events processed (for throughput/observability). */
  eventsProcessed: bigint("events_processed", { mode: "number" })
    .notNull()
    .default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Repos we have asked `tap` to track. Lets the consumer add newly-discovered
 * DIDs (publication owners, contributors, subscribers, recommenders) exactly
 * once and mirror their backfill state for observability.
 */
export const trackedRepos = pgTable(
  "tracked_repos",
  {
    did: text("did").primaryKey(),
    /** Why we started tracking this repo. */
    reason: text("reason"),
    /** When we POSTed it to `tap`'s `/repos/add` (null = discovered, not yet added). */
    addedToTapAt: timestamp("added_to_tap_at", { withTimezone: true }),
    /** Best-effort mirror of tap's backfill state. */
    backfillState: text("backfill_state").notNull().default("pending"),
    /** Last repo rev we've seen for this DID. */
    lastSeenRev: text("last_seen_rev"),
    /** Consecutive reconcile failures (transient fetch errors, or a PDS that
     * can't be resolved) since the last success. Drives `reconcileRetryAfter`
     * backoff; reset to 0 on the next successful reconcile. */
    reconcileFailCount: integer("reconcile_fail_count").notNull().default(0),
    /** Earliest time the round-robin reconcile sweep should retry this DID;
     * null means it's eligible immediately. Set with exponential backoff on
     * failure so a persistently-broken DID stops being retried (and crowding
     * out healthy repos) on every tick. Cleared on success. */
    reconcileRetryAfter: timestamp("reconcile_retry_after", {
      withTimezone: true,
    }),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("tracked_repos_state_idx").on(table.backfillState)],
);

/**
 * Events that failed to process, captured for retry + debugging instead of
 * being silently dropped (the webhook still returns 200 so tap doesn't wedge
 * the per-repo ordering on a poison event).
 */
export const ingestDeadLetter = pgTable(
  "ingest_dead_letter",
  {
    id: serial("id").primaryKey(),
    eventId: bigint("event_id", { mode: "number" }),
    uri: text("uri"),
    collection: text("collection"),
    action: text("action"),
    payload: jsonb("payload"),
    error: text("error"),
    retries: integer("retries").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ingest_dead_letter_collection_idx").on(table.collection)],
);

export type IngestState = typeof ingestState.$inferSelect;
export type TrackedRepo = typeof trackedRepos.$inferSelect;
export type IngestDeadLetter = typeof ingestDeadLetter.$inferSelect;
