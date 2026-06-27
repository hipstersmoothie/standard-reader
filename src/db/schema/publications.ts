import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { tsvector } from "./_shared.ts";

/**
 * `site.standard.publication` records — a blog / site / content platform that
 * acts as a container for documents.
 *
 * Keyed by the record's AT-URI (`at://<did>/site.standard.publication/<rkey>`).
 * Required lexicon fields: `url`, `name`. Everything else is optional and may be
 * absent on minimal records.
 */
export const publications = pgTable(
  "publications",
  {
    /** AT-URI of the publication record (primary, canonical key). */
    uri: text("uri").primaryKey(),
    /** CID of the current record version (for strongRef / change detection). */
    cid: text("cid"),
    /** DID of the owning repo (the author/publisher). */
    did: text("did").notNull(),
    /** Record key (TID) within the repo. */
    rkey: text("rkey").notNull(),

    /** Publication name (required). */
    name: text("name").notNull(),
    /** Base URL, e.g. `https://standard.site` (required). Canonical document
     * URLs are formed by appending the document `path` to this. */
    url: text("url").notNull(),
    /** Brief description / tagline. */
    description: text("description"),

    /** `icon` blob (square avatar). We keep the raw ref (CID); the browser URL
     *  is derived at read time via `cdnImageUrl(did, cid)` — see api-shapes.ts. */
    iconCid: text("icon_cid"),
    iconMime: text("icon_mime"),

    /** Flattened `basicTheme` (site.standard.theme.basic) as CSS color strings,
     * plus the raw object for anything we don't flatten. */
    themeAccent: text("theme_accent"),
    themeBackground: text("theme_background"),
    themeForeground: text("theme_foreground"),
    themeAccentForeground: text("theme_accent_foreground"),
    /** Flattened colors above; the full `basicTheme` object (including the
     * Standard Reader `fonts` extension: Google Font names for collection
     * title/body) round-trips here. */
    themeJson: jsonb("theme_json"),

    /** `preferences.showInDiscover` — whether to surface in discovery feeds. */
    showInDiscover: boolean("show_in_discover").notNull().default(true),

    /** Mirrors `app.standard-reader.collectionsPublication` — marks this
     * publication as a Standard Reader collections series. Set by the tap
     * ingester from the sidecar record (whose rkey matches this publication's
     * rkey); drives the `/collections` read path so it never hits the PDS. */
    collectionsPublication: boolean("collections_publication")
      .notNull()
      .default(false),

    /** App-derived topic (standard.site has no topic field). Used for the
     * Discover directory's topic chips; populated by a derivation pass. */
    topic: text("topic"),

    /** Verification state (well-known `/.well-known/site.standard.publication`).
     * Verified asynchronously because of the publish→deploy race; never block on it. */
    verified: boolean("verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationCheckedAt: timestamp("verification_checked_at", {
      withTimezone: true,
    }),

    /** True if this record currently exists in the repo (soft-delete tombstone). */
    deleted: boolean("deleted").notNull().default(false),

    /** Generated full-text search vector over name + description. */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`setweight(to_tsvector('english', coalesce(name, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B')`,
    ),

    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("publications_did_idx").on(table.did),
    // Directory sort A–Z + lookups by name.
    index("publications_name_idx").on(table.name),
    // Discover filtering: only show eligible, non-deleted pubs.
    index("publications_discover_idx").on(table.showInDiscover, table.deleted),
    index("publications_topic_idx").on(table.topic),
    // Resolve documents whose `site` is an https URL to a publication by base URL.
    index("publications_url_idx").on(table.url),
    index("publications_search_idx").using("gin", table.searchVector),
  ],
);

export type Publication = typeof publications.$inferSelect;
export type NewPublication = typeof publications.$inferInsert;
