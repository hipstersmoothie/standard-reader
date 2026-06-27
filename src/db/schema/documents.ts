import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { tsvector } from "./_shared.ts";

/**
 * `site.standard.document` records — a published article / blog post.
 *
 * Keyed by the record's AT-URI. Required lexicon fields: `site`, `title`,
 * `publishedAt`. A document's `site` may point at a publication record
 * (`at://…/site.standard.publication/…`) or, for "loose" documents, at an
 * `https://` URL with no publication record — so `publicationUri` is nullable.
 */
export const documents = pgTable(
  "documents",
  {
    /** AT-URI of the document record. */
    uri: text("uri").primaryKey(),
    cid: text("cid"),
    /** DID of the authoring repo. */
    did: text("did").notNull(),
    rkey: text("rkey").notNull(),

    /** Document title (required). */
    title: text("title").notNull(),
    /** Raw `site` value from the record (at:// publication OR https:// site). */
    siteUri: text("site_uri").notNull(),
    /** Resolved publication AT-URI, when `site` references / matches a known
     * publication. Null for loose documents or not-yet-indexed publications. */
    publicationUri: text("publication_uri"),
    /** Path component (leading slash). Combined with the publication/site URL
     * to build the canonical URL. */
    path: text("path"),
    /** Fully-resolved canonical URL (publication.url + path), when known. */
    canonicalUrl: text("canonical_url"),

    /** Short excerpt / description. */
    description: text("description"),
    /** Plaintext for full-text search: record textContent + extracted blocks. */
    textContent: text("text_content"),
    /** Raw `content` union object as stored in the record. */
    contentJson: jsonb("content_json"),
    /** `$type` of the content union entry (e.g. the markdown content lexicon). */
    contentFormat: text("content_format"),
    /** Standard Reader collection manifest from `app.standard-reader.collection`
     * (indexed from the sidecar at the same rkey as this document). Null for
     * ordinary documents; its presence marks a doc as a collection. */
    collectionJson: jsonb("collection_json"),
    /** App-derived: whether the reader can render an in-app body for this doc.
     * False for "external" posts (plain text / bsky-anchored / no structured
     * content) — feed cards link those straight out to the publication site in
     * a new tab instead of routing through `/a/$did/$rkey`. Defaults to `true`
     * so un-backfilled rows keep the prior in-app routing until recomputed. */
    hasRenderableBody: boolean("has_renderable_body").notNull().default(true),

    /** `coverImage` blob (the hero/thumbnail). Raw ref (CID); the browser URL
     *  is derived at read time via `cdnImageUrl(did, cid)` — see api-shapes.ts. */
    coverImageCid: text("cover_image_cid"),
    coverImageMime: text("cover_image_mime"),

    /** Free-form tags from the record. */
    tags: text("tags").array(),

    /** App-derived: featured for the masthead lead. Lexicon has no featured
     * flag, so this is set by our derivation/editorial logic. */
    featured: boolean("featured").notNull().default(false),

    /** App-derived: Constellation Bluesky backlink count (precomputed). */
    backlinkCount: integer("backlink_count").notNull().default(0),
    /** Previous backlink count snapshot for velocity delta. */
    backlinkCountPrev: integer("backlink_count_prev").notNull().default(0),
    backlinkSyncedAt: timestamp("backlink_synced_at", { withTimezone: true }),

    /** App-derived: precomputed trending score (recompute cron). */
    trendingScore: doublePrecision("trending_score").notNull().default(0),
    trendingRecomputedAt: timestamp("trending_recomputed_at", {
      withTimezone: true,
    }),

    /** App-derived: distinct recommenders (excl. self) at last trending recompute. */
    distinctRecommenderCount: integer("distinct_recommender_count")
      .notNull()
      .default(0),

    /** `bskyPostRef` strongRef (off-platform comments anchor). */
    bskyPostUri: text("bsky_post_uri"),
    bskyPostCid: text("bsky_post_cid"),

    /** Record timestamps. */
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    recordUpdatedAt: timestamp("record_updated_at", { withTimezone: true }),

    deleted: boolean("deleted").notNull().default(false),

    /** Generated full-text search vector over title, description, and body text. */
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B') || setweight(to_tsvector('english', coalesce(text_content, '')), 'C')`,
    ),

    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("documents_did_idx").on(table.did),
    // Feed / "more from publication": newest-first within a publication.
    index("documents_publication_published_idx").on(
      table.publicationUri,
      table.publishedAt.desc(),
    ),
    // Global Latest feed, newest first.
    index("documents_published_idx").on(table.publishedAt.desc()),
    // Featured-lead lookups.
    index("documents_featured_idx").on(
      table.featured,
      table.publishedAt.desc(),
    ),
    index("documents_site_idx").on(table.siteUri),
    index("documents_search_idx").using("gin", table.searchVector),
    index("documents_trending_idx").on(table.trendingScore.desc()),
  ],
);

/**
 * Document contributors (`site.standard.document#contributor[]`). One row per
 * (document, DID) so we can join to `profiles` for bylines.
 */
export const documentContributors = pgTable(
  "document_contributors",
  {
    documentUri: text("document_uri")
      .notNull()
      .references(() => documents.uri, { onDelete: "cascade" }),
    /** Contributor DID (also materialized as a profile row). */
    did: text("did").notNull(),
    /** Optional role label (e.g. "author", "editor"). */
    role: text("role"),
    /** Snapshot of the display name embedded in the record. */
    displayName: text("display_name"),
  },
  (table) => [
    primaryKey({ columns: [table.documentUri, table.did] }),
    index("document_contributors_did_idx").on(table.did),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentContributor = typeof documentContributors.$inferSelect;
export type NewDocumentContributor = typeof documentContributors.$inferInsert;
