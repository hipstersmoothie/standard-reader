import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * `site.standard.graph.subscription` records — the subscription graph (these are
 * standard.site subscriptions, NOT Bluesky follows). A subscription means the
 * repo owner (`subscriberDid`) subscribes to a publication.
 *
 * Keyed by the record AT-URI. Required lexicon field: `publication` (at-uri).
 * This graph powers social proof, "followed by people you follow", and the
 * co-subscription recommendations.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    /** AT-URI of the subscription record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the subscriber (the repo that holds this record). */
    subscriberDid: text("subscriber_did").notNull(),
    rkey: text("rkey").notNull(),

    /** AT-URI of the subscribed-to publication record (required). */
    publicationUri: text("publication_uri").notNull(),
    /** DID extracted from `publicationUri` (useful before the publication
     * record itself has been indexed). */
    publicationDid: text("publication_did"),

    /** `createdAt` from the record (optional in the lexicon). */
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
    // Subscriber count + "readers also follow" fan-out from a publication.
    index("subscriptions_publication_idx").on(table.publicationUri),
    // A given user's subscription list (sidebar / feed).
    index("subscriptions_subscriber_idx").on(table.subscriberDid),
    // Look up the edge (a subscriber→publication pair). NOT unique: a repo can
    // legitimately hold multiple subscription records for the same pair, and
    // each record is uniquely keyed by `uri`. Counts use DISTINCT subscriber.
    index("subscriptions_edge_idx").on(
      table.subscriberDid,
      table.publicationUri,
    ),
  ],
);

/**
 * `site.standard.graph.recommend` records — per-document endorsements. A
 * lightweight signal that feeds trending and recommendations.
 *
 * Keyed by the record AT-URI. Required lexicon fields: `document`, `createdAt`.
 */
export const recommends = pgTable(
  "recommends",
  {
    /** AT-URI of the recommend record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the recommender (the repo that holds this record). */
    recommenderDid: text("recommender_did").notNull(),
    rkey: text("rkey").notNull(),

    /** AT-URI of the recommended document (required). */
    documentUri: text("document_uri").notNull(),
    /** DID extracted from `documentUri`. */
    documentDid: text("document_did"),

    /** `createdAt` from the record (required in the lexicon). */
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
    index("recommends_document_idx").on(table.documentUri),
    index("recommends_recommender_idx").on(table.recommenderDid),
    // NOT unique — see subscriptions_edge_idx. Each record keyed by `uri`.
    index("recommends_edge_idx").on(table.recommenderDid, table.documentUri),
    // Serves the follow-feed's two correlated subqueries (the EXISTS probe and
    // `max(created_at)` for the recommend-sourced `feedAt`): leading
    // `document_uri` matches the correlation on a document row, `recommender_did`
    // serves the followed-user IN filter, and `created_at` lets `max()` read
    // straight off the index. NULLS LAST to match the query's ORDER BY.
    index("recommends_doc_recommender_created_idx")
      .on(
        table.documentUri,
        table.recommenderDid,
        sql`${table.createdAt} desc nulls last`,
      )
      .where(sql`${table.deleted} = false`),
  ],
);

/**
 * `app.standard-reader.graph.follow` records — the user-follow graph (actor →
 * actor, distinct from publication subscriptions). A follow means the repo owner
 * (`followerDid`) follows another user (`subjectDid`); the followed user's
 * recommends and documents enrich the follower's home feed.
 *
 * Keyed by the record AT-URI. Required lexicon fields: `subject` (did),
 * `createdAt`. The rkey is derived from the subject DID (deterministic), so each
 * followed user maps to a single record per follower.
 */
export const userFollows = pgTable(
  "user_follows",
  {
    /** AT-URI of the follow record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the follower (the repo that holds this record). */
    followerDid: text("follower_did").notNull(),
    rkey: text("rkey").notNull(),

    /** DID of the followed user (required). */
    subjectDid: text("subject_did").notNull(),

    /** Publications of the followed user the reader opted out of — following a
     * user subscribes to all their publications except these (mirrors the
     * record's `excludedPublications`). AT URIs. */
    excludedPublications: jsonb("excluded_publications").notNull().default([]),

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
    // A given user's follow list (sidebar / feed follow-set).
    index("user_follows_follower_idx").on(table.followerDid),
    // Follower fan-out from a followed user (social proof, follower counts).
    index("user_follows_subject_idx").on(table.subjectDid),
    // Look up the edge (a follower→subject pair). NOT unique — see
    // subscriptions_edge_idx. Each record uniquely keyed by `uri`.
    index("user_follows_edge_idx").on(table.followerDid, table.subjectDid),
  ],
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type Recommend = typeof recommends.$inferSelect;
export type NewRecommend = typeof recommends.$inferInsert;
export type UserFollow = typeof userFollows.$inferSelect;
export type NewUserFollow = typeof userFollows.$inferInsert;
