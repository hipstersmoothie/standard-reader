import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * `app.standard-reader.site` records — how an author, or one of their
 * publications, presents itself as a standalone site (a page with none of
 * Standard Reader's own chrome).
 *
 * Keyed by the record AT-URI so ingest upserts and deletes are idempotent. The
 * record key is deterministic per subject — `self` for the author's own site,
 * a hash of the publication's AT-URI for a publication's — so a repo holds at
 * most one row per subject and the read path can look one up by
 * `(owner_did, publication_uri)` without deduplicating.
 *
 * A missing row is not an error: a site still renders in the default style. The
 * row only carries what its owner chose to change.
 */
export const sites = pgTable(
  "sites",
  {
    /** AT-URI of the site record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the author or publisher (the repo that holds this record). */
    ownerDid: text("owner_did").notNull(),
    rkey: text("rkey").notNull(),

    /**
     * AT-URI of the `site.standard.publication` this site presents. Null for
     * the author's own site, which covers everything they publish.
     */
    publicationUri: text("publication_uri"),

    /** Which presentation the site is laid out in (see `#/lib/site/styles`). */
    style: text("style").notNull().default("broadsheet"),
    /** Short line under the site's name. */
    tagline: text("tagline"),

    /** The site's own four flat colors, when it states any. */
    themeBackground: text("theme_background"),
    themeForeground: text("theme_foreground"),
    themeAccent: text("theme_accent"),
    themeAccentForeground: text("theme_accent_foreground"),

    /** Outbound masthead links: `[{ label, url }]`. */
    links: jsonb("links").notNull().default([]),
    /** Whether the footer links back to the Standard Reader page. */
    showStandardReaderLink: boolean("show_standard_reader_link")
      .notNull()
      .default(true),

    /**
     * A domain the owner serves this site from instead of the Writer path — a
     * Standard Writer Pro feature.
     *
     * Stored lowercased and without a scheme (`atlas.example.com`). Unique
     * across every site, because a hostname can only point at one page: the
     * partial index below is what makes a second claim on the same domain fail
     * at the database rather than at whichever request happens to arrive first.
     */
    customDomain: text("custom_domain"),
    /** When the domain's DNS was last seen pointing here; null = unverified. */
    customDomainVerifiedAt: timestamp("custom_domain_verified_at", {
      withTimezone: true,
    }),

    /** `updatedAt` from the record. */
    updatedAt: timestamp("updated_at", { withTimezone: true }),

    deleted: boolean("deleted").notNull().default(false),

    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The two lookups the read path makes: one owner's author site, and one
    // owner's site for a given publication.
    index("sites_owner_idx").on(table.ownerDid, table.publicationUri),
    index("sites_publication_idx").on(table.publicationUri),
    // One hostname, one site. Partial so the overwhelming majority of rows —
    // every site without a custom domain — are not in the index at all.
    uniqueIndex("sites_custom_domain_idx")
      .on(table.customDomain)
      .where(sql`${table.customDomain} is not null`),
  ],
);

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
