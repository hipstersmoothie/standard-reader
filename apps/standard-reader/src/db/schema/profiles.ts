import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Actor profiles, keyed by DID.
 *
 * standard.site has no profile lexicon — a publication's author is just the DID
 * of the repo that owns the record. So identity/profile data (handle, display
 * name, avatar, banner, bio) is backfilled from the AT Protocol identity layer
 * (`tap` identity events / PLC) and the Bluesky `app.bsky.actor.profile` record.
 *
 * We materialize a profile row for every DID that appears in the UI: publication
 * owners and document contributors. Subscribers/recommenders get a row only if
 * they happen to also be owners/contributors (we still store their DID on the
 * graph rows regardless).
 */
export const profiles = pgTable(
  "profiles",
  {
    /** The actor's DID (e.g. `did:plc:abc123`). Authoritative identifier. */
    did: text("did").primaryKey(),
    /** Current handle (e.g. `alice.bsky.social`), from identity resolution. */
    handle: text("handle"),
    /** PDS service endpoint, resolved from the DID document. Used to build
     * `com.atproto.sync.getBlob` URLs for standard.site blobs (icons/covers). */
    pds: text("pds"),
    /** Account active flag from the latest identity event (`status`). */
    isActive: boolean("is_active").notNull().default(true),

    /** `app.bsky.actor.profile` display fields. */
    displayName: text("display_name"),
    description: text("description"),
    /** Fully-resolved CDN URLs (cdn.bsky.app) built from the profile blob refs. */
    avatarUrl: text("avatar_url"),
    bannerUrl: text("banner_url"),
    /** AT-URI + CID of the `app.bsky.actor.profile` record, when seen. */
    bskyProfileUri: text("bsky_profile_uri"),
    bskyProfileCid: text("bsky_profile_cid"),

    /** When we last refreshed the Bluesky profile fields specifically. */
    profileFetchedAt: timestamp("profile_fetched_at", { withTimezone: true }),
    /** First time we indexed this DID. */
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Last time any field on this row changed. */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("profiles_handle_idx").on(table.handle),
    // Trigram indexes powering the author/handle `ILIKE '%q%'` lookups in search
    // (article author pre-resolution, loose-doc accounts). A plain btree can't
    // serve a leading-wildcard match; `gin_trgm_ops` can.
    index("profiles_handle_trgm_idx").using(
      "gin",
      table.handle.op("gin_trgm_ops"),
    ),
    index("profiles_display_name_trgm_idx").using(
      "gin",
      table.displayName.op("gin_trgm_ops"),
    ),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
