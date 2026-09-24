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

/**
 * {@link NETWORK_DOCUMENT_COUNT_KEY}, minus everything authored by — or
 * published under — one of Bridgy Fed's bulk web-bridge mirrors: the tally the
 * Latest "All" badge needs for a reader with "Hide mirrored websites" on (see
 * `#/lib/exclude-web-bridge`).
 *
 * A second precomputed scalar rather than a live count, for the same reason as
 * the first and then some: the mirrors are ~86% of the corpus, so the filtered
 * count cannot short-circuit anywhere and measured **26.5s** against production
 * — two orders of magnitude worse than the unfiltered scan it replaces.
 */
export const NETWORK_DOCUMENT_COUNT_NO_WEB_BRIDGE_KEY =
  "network_document_count_no_web_bridge";

/**
 * Stands in for `lang IS NULL` in a per-language key. Not a code in
 * `#/lib/content-language`, so it can never collide with a real one.
 */
export const UNTAGGED_LANGUAGE_KEY = "und";

/**
 * Per-language breakdown of the two scalars above, so the Latest "All" badge
 * stays honest for a reader who filtered their feed by language.
 *
 * A filtered count cannot be computed live for the same reason the web-bridge
 * one cannot — the eligibility predicate is a left join that no index serves —
 * and it cannot be a single extra scalar either, because there is one per
 * subset of ~66 languages. So the sweep emits one row per language instead and
 * the read path sums the ones the reader picked, plus
 * {@link UNTAGGED_LANGUAGE_KEY}: untagged documents are always shown, so they
 * are always in the total. That is 134 small rows maintained by the same single
 * scan that already produced the two totals (`GROUPING SETS`), read back as one
 * primary-key lookup.
 */
export function networkDocumentCountLanguageKey(
  lang: string,
  excludeWebBridge: boolean,
): string {
  const base = excludeWebBridge
    ? NETWORK_DOCUMENT_COUNT_NO_WEB_BRIDGE_KEY
    : NETWORK_DOCUMENT_COUNT_KEY;
  return `${base}_lang:${lang}`;
}

export type NetworkStat = typeof networkStats.$inferSelect;
export type NewNetworkStat = typeof networkStats.$inferInsert;
