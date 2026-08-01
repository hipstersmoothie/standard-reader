import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Precomputed network-wide scalars — a tiny key/value table for aggregates that
 * are identical for every reader and too expensive to compute per request.
 *
 * Rebuilt each sweep by `recomputeNetworkStats()`. The first entry is
 * {@link NETWORK_DOCUMENT_COUNT_KEY}, the Latest "All" tab badge: counting it
 * live is an unbounded `count(*)` over every document row joined to
 * publications, which cannot be index-served (the eligibility predicate is
 * `p.uri IS NULL OR … p.url NOT ILIKE …` across a left join). At ~1.4M
 * documents / 2.2GB that measured ~1.08s per call as a parallel seq scan, on
 * the `/latest` route loader's critical path — and re-read the heap from
 * storage each time, evicting the pages the sibling feed queries rely on.
 *
 * Same trade as `discover_topic_counts`: the sweep already walks these tables,
 * so maintaining the scalar is near-free marginal work.
 */
export const networkStats = pgTable("network_stats", {
  /** Stable identifier for the aggregate (see the `*_KEY` constants below). */
  key: text("key").primaryKey(),
  /** The aggregate. `bigint` so a growing corpus can never overflow. */
  value: bigint("value", { mode: "number" }).notNull(),
  recomputedAt: timestamp("recomputed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Discover-eligible, published, non-deleted documents across the network. */
export const NETWORK_DOCUMENT_COUNT_KEY = "network_document_count";

export type NetworkStat = typeof networkStats.$inferSelect;
export type NewNetworkStat = typeof networkStats.$inferInsert;
