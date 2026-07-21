CREATE TABLE "discover_topic_counts" (
	"topic" text PRIMARY KEY NOT NULL,
	"publication_count" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "discover_topic_counts_count_idx" ON "discover_topic_counts" USING btree ("publication_count" DESC NULLS LAST,"topic");--> statement-breakpoint
CREATE INDEX "discover_topic_counts_topic_trgm_idx" ON "discover_topic_counts" USING gin ("topic" gin_trgm_ops);--> statement-breakpoint
-- Initial populate so the Discover topic filter has chips before the first
-- recomputeTopics() sweep. Kept in sync with recomputeTopics() thereafter.
INSERT INTO "discover_topic_counts" ("topic", "publication_count")
WITH eligible AS (
  SELECT p.uri, p.topic
  FROM publications p
  WHERE p.show_in_discover = true
    AND p.deleted = false
    AND p.url NOT ILIKE '%blento.app%'
),
pub_topic AS (
  SELECT uri, lower(btrim(topic)) AS topic
  FROM eligible
  WHERE topic IS NOT NULL AND btrim(topic) <> ''
  UNION
  SELECT e.uri, lower(btrim(tag)) AS topic
  FROM eligible e
  JOIN documents d ON d.publication_uri = e.uri AND d.deleted = false
  CROSS JOIN unnest(d.tags) AS tag
  WHERE btrim(tag) <> ''
)
SELECT topic, count(*)::int AS publication_count
FROM pub_topic
WHERE char_length(topic) BETWEEN 1 AND 128
GROUP BY topic;