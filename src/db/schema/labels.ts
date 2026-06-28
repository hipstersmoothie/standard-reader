import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Per-label visibility a reader has chosen for a labeler's label value. */
export type LabelVisibility = "ignore" | "warn" | "hide";
export interface LabelPref {
  val: string;
  visibility: LabelVisibility;
}

/** A label-value definition as carried on a labeler.service record's policies. */
export interface LabelValueDefinition {
  identifier?: string;
  severity?: string;
  blurs?: string;
  defaultSetting?: string;
  adultOnly?: boolean;
  locales?: Array<{ lang?: string; name?: string; description?: string }>;
}

/**
 * `app.standard-reader.labeler.service` records — the registration of a labeler,
 * indexed off the network (the owner DID is the labeler's author). Drives the
 * Labelers directory and where to reach each labeler's label server.
 */
export const labelerServices = pgTable(
  "labeler_services",
  {
    /** AT-URI of the labeler.service record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID that owns the record (the labeler's author). */
    ownerDid: text("owner_did").notNull(),
    rkey: text("rkey").notNull(),

    /** DID of the labeler itself (`src` on its labels). */
    labelerDid: text("labeler_did").notNull(),
    /** Origin serving queryLabels / subscribeLabels. */
    serviceEndpoint: text("service_endpoint").notNull(),

    displayName: text("display_name"),
    description: text("description"),
    /** Resolved avatar blob URL (owner PDS getBlob), if any. */
    avatarUrl: text("avatar_url"),
    /** `policies.labelValueDefinitions` from the record. */
    labelValueDefinitions: jsonb("label_value_definitions").$type<
      Array<LabelValueDefinition>
    >(),

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
    // Look up a labeler's registration by its DID (subscriptions reference the DID).
    index("labeler_services_labeler_idx").on(table.labelerDid),
  ],
);

export type LabelerService = typeof labelerServices.$inferSelect;
export type NewLabelerService = typeof labelerServices.$inferInsert;

/**
 * `app.standard-reader.labeler.subscription` (V2) and legacy
 * `app.standard-reader.labelerSubscription` records — which labeler services a
 * reader has subscribed to (like Bluesky's subscribed moderation services).
 *
 * V2 is the nested-NSID successor; new writes target V2, reads accept both
 * until per-reader migration completes (the lazy migration on the labeler
 * write path rewrites old records). Keyed by the record AT-URI. Required
 * lexicon field: `labeler` (a DID). This is a read-model mirror of records the
 * reader writes to their own repo; it lets the app filter labels to a reader's
 * subscribed labelers without a repo read.
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

/**
 * Labels mirrored from labeler services into the read-model. A periodic sync is
 * the *only* time we contact a labeler; request paths (feeds, tag, article,
 * labeler detail) read labels from here via SQL, so they never make per-request
 * label calls. One row per active `(src, uri, val)` — negations are applied at
 * sync time by removing the row rather than storing it.
 */
export const documentLabels = pgTable(
  "document_labels",
  {
    /** Labeler DID that emitted the label (the label's `src`). */
    src: text("src").notNull(),
    /** Subject document AT-URI. */
    uri: text("uri").notNull(),
    /** Label value (e.g. "ai-writing", "bot"). */
    val: text("val").notNull(),
    /** Label creation time reported by the labeler (`cts`). */
    cts: timestamp("cts", { withTimezone: true }),
    /** When this row was last refreshed by a sync. */
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.src, table.uri, table.val] }),
    // Resolve labels for a set of document URIs (feed/tag/article attach).
    index("document_labels_uri_idx").on(table.uri),
    // Replace-by-labeler during sync + labeler-detail document listing.
    index("document_labels_src_idx").on(table.src),
  ],
);

export type DocumentLabelRow = typeof documentLabels.$inferSelect;
