/** Canonical topic chip order from the Postcard prototype (`data.js`). */
export const CANONICAL_DISCOVER_TOPICS = [
  "Technology",
  "Culture",
  "Science",
  "Essays",
  "Climate",
  "Design",
  "Politics",
  "Fiction",
] as const;

export interface TopicChipItem {
  id: string;
  name: string;
}

/** Sort network topics to match the prototype chip row, then append the rest A–Z. */
export function sortDiscoverTopics(
  topics: Array<{ topic: string; count: number }>,
): Array<TopicChipItem> {
  const byKey = new Map(
    topics.map((row) => [row.topic.toLowerCase(), row.topic]),
  );
  const ordered: Array<TopicChipItem> = [{ id: "all", name: "All" }];

  for (const canonical of CANONICAL_DISCOVER_TOPICS) {
    const match = byKey.get(canonical.toLowerCase());
    if (match) {
      ordered.push({ id: match, name: match });
      byKey.delete(canonical.toLowerCase());
    }
  }

  const rest = [...byKey.values()].toSorted((a, b) => a.localeCompare(b));
  for (const topic of rest) {
    ordered.push({ id: topic, name: topic });
  }

  return ordered;
}

/**
 * Map raw topic search results to chip items, preserving the server's
 * count-desc (most-used first) ordering. Unlike {@link sortDiscoverTopics},
 * this injects no "All" entry and applies no canonical reordering — a search is
 * a flat relevance list over the whole vocabulary, not the curated chip row.
 */
export function searchResultTopics(
  topics: Array<{ topic: string; count: number }>,
): Array<TopicChipItem> {
  return topics.map((row) => ({ id: row.topic, name: row.topic }));
}
