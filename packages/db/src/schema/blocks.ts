import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Blocks — mirrored `app.bsky.graph.block` records.
 *
 * Unlike labeler subscriptions (which Bluesky keeps in an account's preferences
 * blob, so porting them meant writing *our own* records — see
 * `server/labeler/import-bsky.server.ts`), a block already **is** a repo record.
 * It lives in the blocker's repo, it is portable, and every AT Protocol app that
 * honours it is reading the same record. So there is no Standard Reader block
 * lexicon and there never should be: we mirror `app.bsky.graph.block` and honour
 * it, and blocking from here writes that same record. A reader's blocks follow
 * them to whatever they use next.
 *
 * One row per block record, both directions:
 *  - **outgoing** — records in a reader's own repo, read from their PDS.
 *  - **incoming** — records in *other* repos whose `subject` is one of our
 *    readers, discovered through Constellation backlinks. Bluesky's appview
 *    knows the whole block graph; we don't, so the reverse edge has to be
 *    looked up per reader rather than derived.
 *
 * Both directions hide content, exactly as they do on Bluesky: a block is
 * mutual in effect even though the record is one-sided.
 */
export const blocks = pgTable(
  "blocks",
  {
    /** AT-URI of the `app.bsky.graph.block` record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the blocker (the repo that holds this record). */
    blockerDid: text("blocker_did").notNull(),
    rkey: text("rkey").notNull(),

    /** DID of the blocked account (the record's `subject`). */
    subjectDid: text("subject_did").notNull(),

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
    // "who blocks this reader" — the incoming half. Read on every
    // block-filtered query alongside the outgoing half below.
    index("blocks_subject_idx").on(table.subjectDid),
    // Probe a single edge (does A block B?) for the profile block button, and
    // — on its `blocker_did` prefix — "who does this reader block" for the
    // outgoing half. One index serves both; a separate `blocker_did` index
    // would be a strict prefix of this one, costing writes to answer nothing
    // new.
    index("blocks_edge_idx").on(table.blockerDid, table.subjectDid),
  ],
);

/**
 * Block lists — mirrored `app.bsky.graph.listblock` records. Subscribing to a
 * moderation list blocks everyone on it, and stays live as the list changes.
 *
 * Same two directions as {@link blocks}: a reader's own listblocks (read from
 * their repo), and listblocks by *other* accounts against a list the reader is
 * a member of — which is how Bluesky's `blockedByList` works, and the reason a
 * reader can be blocked by someone who never named them.
 */
export const blockLists = pgTable(
  "block_lists",
  {
    /** AT-URI of the `app.bsky.graph.listblock` record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the blocker (the repo that holds this record). */
    blockerDid: text("blocker_did").notNull(),
    rkey: text("rkey").notNull(),

    /** AT-URI of the blocked `app.bsky.graph.list` (the record's `subject`). */
    listUri: text("list_uri").notNull(),

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
    // A reader's subscribed block lists (settings, outgoing resolution).
    index("block_lists_blocker_idx").on(table.blockerDid),
    // Everyone blocking a given list (incoming resolution, subscriber counts).
    index("block_lists_list_idx").on(table.listUri),
  ],
);

/**
 * Membership of the moderation lists we mirror — one row per
 * `app.bsky.graph.listitem`.
 *
 * Only lists somebody actually blocks are mirrored, and only as far as the cap
 * in `blocks/sync.server.ts`: popular blocklists run to tens of thousands of
 * members, and storing every list on the network would dwarf the rest of the
 * read-model for no benefit.
 */
export const blockListItems = pgTable(
  "block_list_items",
  {
    /** AT-URI of the `app.bsky.graph.listitem` record. */
    uri: text("uri").primaryKey(),
    /** AT-URI of the list this item belongs to. */
    listUri: text("list_uri").notNull(),
    /** DID of the listed account. */
    subjectDid: text("subject_did").notNull(),

    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Expand a blocked list into its members (settings, diagnostics).
    index("block_list_items_list_idx").on(table.listUri),
    // "which mirrored lists is this account on" — both the incoming
    // blocked-by-list resolution and the "why am I seeing this" explanation.
    index("block_list_items_subject_idx").on(table.subjectDid),
    // The hot one: "is any account on this page a member of a list this reader
    // blocks". Leading `list_uri` matches the join to the reader's (small) set
    // of blocked lists, then `subject_did` narrows to the page — so a reader on
    // a 40k-member blocklist costs an index probe per card, not a list scan.
    index("block_list_items_list_subject_idx").on(
      table.listUri,
      table.subjectDid,
    ),
  ],
);

/**
 * Per-list mirror bookkeeping, so membership is refreshed on a cadence rather
 * than on every read, and a list that can't be fetched is distinguishable from
 * one that is genuinely empty.
 */
export const blockListSyncState = pgTable("block_list_sync_state", {
  /** AT-URI of the `app.bsky.graph.list`. */
  listUri: text("list_uri").primaryKey(),
  /** DID of the list's owner (derived from `listUri`). */
  ownerDid: text("owner_did").notNull(),

  /** Display name from the list record, for the settings surface. */
  name: text("name"),
  description: text("description"),
  /** `purpose` from the list record — we only block `#modlist` lists. */
  purpose: text("purpose"),

  /** Members mirrored on the last successful run. */
  itemCount: integer("item_count").notNull().default(0),
  /**
   * Set when the list is larger than the mirror cap, so the settings surface can
   * say the block is partial instead of quietly under-enforcing it.
   */
  truncated: boolean("truncated").notNull().default(false),
  /** Why the last run failed; null when it succeeded. */
  lastError: text("last_error"),

  syncedAt: timestamp("synced_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Per-reader block-sync bookkeeping. Blocks are not on the firehose tap (they
 * live in arbitrary repos across the network, not the ones we track), so they
 * are pulled per reader on a cadence — this is what makes that cadence cheap to
 * check on every request.
 */
export const blockSyncState = pgTable("block_sync_state", {
  /** DID of the reader whose blocks were synced. */
  did: text("did").primaryKey(),
  /** Outgoing block records mirrored on the last run. */
  outgoingCount: integer("outgoing_count").notNull().default(0),
  /** Incoming block records mirrored on the last run. */
  incomingCount: integer("incoming_count").notNull().default(0),
  /** Block lists (both directions) mirrored on the last run. */
  listCount: integer("list_count").notNull().default(0),
  /** Why the last run failed; null when it succeeded. */
  lastError: text("last_error"),

  syncedAt: timestamp("synced_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Block = typeof blocks.$inferSelect;
export type NewBlock = typeof blocks.$inferInsert;
export type BlockList = typeof blockLists.$inferSelect;
export type NewBlockList = typeof blockLists.$inferInsert;
export type BlockListItem = typeof blockListItems.$inferSelect;
export type NewBlockListItem = typeof blockListItems.$inferInsert;
export type BlockListSyncState = typeof blockListSyncState.$inferSelect;
export type BlockSyncState = typeof blockSyncState.$inferSelect;
