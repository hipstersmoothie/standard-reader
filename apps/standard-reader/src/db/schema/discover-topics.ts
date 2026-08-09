import { index, integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Precomputed network-wide topic (tag) counts powering the Discover topic
 * filter. One row per distinct lower-cased tag across discover-eligible
 * publications; `publicationCount` is how many such publications carry the tag
 * — via an explicit `publications.topic` OR any of the publication's document
 * tags — which is exactly how many a reader reaches by selecting the chip.
 *
 * Refreshed daily by `recomputeDiscoverTopicCounts()` on the topic cron, which
 * diffs against the live table rather than rebuilding it — an hour of ingest
 * moves ~85 of these 1.05M rows, so a full `DELETE` + `INSERT` was rewriting
 * the heap and all three indexes below to persist almost nothing. Reading from
 * this table keeps the Discover request path off a ~2s network-wide
 * `unnest(tags)` aggregation.
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
