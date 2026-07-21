import { index, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Precomputed network-wide topic (tag) counts powering the Discover topic
 * filter. One row per distinct lower-cased tag across discover-eligible
 * publications; `publicationCount` is how many such publications carry the tag
 * — via an explicit `publications.topic` OR any of the publication's document
 * tags — which is exactly how many a reader reaches by selecting the chip.
 *
 * Rebuilt each sweep by `recomputeTopics()`. Reading from this table keeps the
 * Discover request path off a ~2s network-wide `unnest(tags)` aggregation; the
 * cron already scans every tag to derive per-publication dominant topics, so
 * populating this is near-free marginal work.
 */
export const discoverTopicCounts = pgTable(
  "discover_topic_counts",
  {
    /** Lower-cased, trimmed tag. Length-bounded in the recompute so it fits a
     * btree primary key. */
    topic: text("topic").primaryKey(),
    /** Distinct discover-eligible publications that carry this tag. */
    publicationCount: integer("publication_count").notNull(),
  },
  (table) => [
    // Default chip row is "top-N by count" — this index serves the ORDER BY.
    index("discover_topic_counts_count_idx").on(
      table.publicationCount.desc(),
      table.topic,
    ),
    // Popover search runs ILIKE '%term%' (leading wildcard); the btree above
    // can't serve that, so a trigram GIN index does.
    index("discover_topic_counts_topic_trgm_idx").using(
      "gin",
      table.topic.op("gin_trgm_ops"),
    ),
  ],
);
