import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { publications } from "./publications.ts";

/**
 * Auto-derived topics (`APP_VISION.md` §5): a cluster of related tags
 * presented as one browsable area, with its own trending publications and
 * documents, and its member tags exposed as sub-areas.
 *
 * Topics exist because the raw tag vocabulary is both too large (450k+
 * distinct tags in `discover_topic_counts`) and too skewed to be a navigation
 * surface — ranking tags by frequency puts the network's atproto-native topics
 * (`atproto`, `bluesky`, `atmosphere`, …) on top of a page meant to represent
 * the whole network. Clustering rebalances that: atproto becomes one topic
 * among many.
 *
 * Rebuilt each sweep by `recomputeTopics()`, which clusters the tag
 * co-occurrence graph and names each cluster. Nothing here is hand-curated.
 */
export const topics = pgTable(
  "topics",
  {
    /**
     * Stable URL identity (`/topics/$slug`). Assigned once, when the
     * topic first appears, and never changed afterwards — the sweep matches
     * re-derived clusters back onto existing rows by tag-set overlap so a
     * topic's URL survives the cluster drifting or being renamed.
     */
    slug: text("slug").primaryKey(),

    /** Display name. Authored by the naming model; see `nameModel`. */
    name: text("name").notNull(),
    /** One-line description, also model-authored. Not a translated UI string. */
    description: text("description"),

    /**
     * The cluster's highest-weight tags, in descending weight order. Doubles as
     * the naming model's input and as the identity fingerprint the next sweep
     * matches against — a large drift here is what triggers a re-name.
     */
    signatureTags: text("signature_tags").array().notNull(),

    /** Cluster size and reach, recomputed every sweep. */
    tagCount: integer("tag_count").notNull().default(0),
    publicationCount: integer("publication_count").notNull().default(0),
    /**
     * Distinct repo DIDs behind those publications. This is the signal that
     * separates a topic from a single-operator publication fleet: the
     * largest tag cluster on the network by publication count is one bot
     * network (773 publications, all from one DID), and only a distinct-author
     * threshold excludes it.
     */
    authorCount: integer("author_count").notNull().default(0),
    documentCount: integer("document_count").notNull().default(0),

    /** Ranking score for the Discover rail and any listing. */
    score: doublePrecision("score").notNull().default(0),

    /**
     * Whether the cluster cleared the quality bar in the latest sweep. Rows
     * below the bar are kept (not deleted) so a topic that dips and
     * recovers keeps its slug and name rather than minting a new URL.
     */
    published: boolean("published").notNull().default(false),

    /** Model that produced `name`/`description`; null when the fallback (the
     * cluster's dominant tag) was used because naming was unavailable. */
    nameModel: text("name_model"),
    namedAt: timestamp("named_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The Discover rail and any listing read "published, best first".
    index("topics_published_score_idx").on(table.published, table.score.desc()),
  ],
);

/**
 * A topic's member tags — the "sub-areas" surfaced on the topic page,
 * each linking to the existing `/tag/$tag` view.
 *
 * Also the source of the tag array used to scope a topic's documents:
 * documents are matched live via `immutable_normalized_tags(tags) && <array>`
 * (GIN-servable) rather than materialized, since a topic spans hundreds of
 * thousands of documents.
 */
export const topicTags = pgTable(
  "topic_tags",
  {
    topicSlug: text("topic_slug")
      .notNull()
      .references(() => topics.slug, { onDelete: "cascade" }),
    /** Normalized tag — `lower(btrim(...))`, matching `documents_tags_norm_idx`. */
    tag: text("tag").notNull(),
    /** Cosine centrality of the tag within its cluster; orders the sub-areas. */
    weight: doublePrecision("weight").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.topicSlug, table.tag] }),
    // Reverse lookup: which topic does this tag belong to?
    index("topic_tags_tag_idx").on(table.tag),
    // Sub-area chips are "top-N by weight" for one topic.
    index("topic_tags_weight_idx").on(table.topicSlug, table.weight.desc()),
  ],
);

/**
 * Precomputed topic membership for publications, so the topic rail and
 * the topic page's Publications tab are a plain indexed read instead of a
 * per-request tag aggregation.
 */
export const topicPublications = pgTable(
  "topic_publications",
  {
    topicSlug: text("topic_slug")
      .notNull()
      .references(() => topics.slug, { onDelete: "cascade" }),
    publicationUri: text("publication_uri")
      .notNull()
      .references(() => publications.uri, { onDelete: "cascade" }),
    /** How strongly the publication belongs — summed weight of its matched tags. */
    score: doublePrecision("score").notNull().default(0),
    /** Distinct topic tags this publication's documents carry. */
    matchedTagCount: integer("matched_tag_count").notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.topicSlug, table.publicationUri] }),
    // Top-N publications within a topic.
    index("topic_publications_rank_idx").on(
      table.topicSlug,
      table.score.desc(),
    ),
    // Reverse lookup: which topics is this publication in? Used to
    // personalize the Discover rail from the reader's follows.
    index("topic_publications_pub_idx").on(table.publicationUri),
  ],
);

/**
 * Cached sentence-embedding per tag, so the topic sweep pays the model once
 * per tag rather than once per hour.
 *
 * Embeddings exist because co-occurrence alone cannot join a subject its
 * publishers happen to split: `typescript` and `css` are the same area, but the
 * people who tag one largely are not the people who tag the other, so no amount
 * of counting relates them. Meaning does.
 *
 * Small by construction — one row per tag in the clustering vocabulary (a few
 * thousand), not one per document — so it needs no vector extension; the sweep
 * loads the whole table and compares in memory.
 */
export const tagEmbeddings = pgTable("tag_embeddings", {
  /** Normalized tag, matching `discover_topic_counts.topic`. */
  tag: text("tag").primaryKey(),
  /** Unit-normalized vector, so similarity is a plain dot product. */
  embedding: doublePrecision("embedding").array().notNull(),
  /** Model that produced it; a change invalidates the row. */
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TagEmbedding = typeof tagEmbeddings.$inferSelect;

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
export type TopicTag = typeof topicTags.$inferSelect;
export type NewTopicTag = typeof topicTags.$inferInsert;
export type TopicPublication = typeof topicPublications.$inferSelect;
export type NewTopicPublication = typeof topicPublications.$inferInsert;
