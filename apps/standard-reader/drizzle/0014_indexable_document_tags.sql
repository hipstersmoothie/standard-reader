-- Make tag lookups indexable.
--
-- The tag page matched tags with
--   exists (select 1 from unnest(documents.tags) as doc_tag
--           where lower(btrim(doc_tag)) = lower(btrim($tag)))
-- which no index can serve: Postgres had to seq-scan `documents` and unnest
-- every row's tags array on every tag page load. Measured on prod, the article
-- count alone was a 886ms Seq Scan (356k rows removed by filter, 79k blocks) and
-- the publication count 3.6s — which is why a tag with *zero* matches still cost
-- well over a second.
--
-- Normalizing the whole array in one IMMUTABLE function makes the same predicate
-- expressible as array containment (`@> array[lower(btrim($tag))]`), which a GIN
-- index can answer directly. Same normalization as before (lowercase, trim, drop
-- blanks), so results are unchanged — verified equal across a sample of tags
-- including case/whitespace variants and non-ASCII.
--
-- `array_agg` over `unnest` is only usable in an index expression when wrapped in
-- an IMMUTABLE function, mirroring `immutable_array_to_string` in 0013.
CREATE OR REPLACE FUNCTION immutable_normalized_tags(text[]) RETURNS text[]
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT array_agg(lower(btrim(t))) FROM unnest($1) AS t WHERE btrim(t) <> ''
  $$;--> statement-breakpoint
-- Created CONCURRENTLY on prod out-of-band (a plain CREATE INDEX takes a long
-- lock on `documents`, which is ~356k rows); IF NOT EXISTS makes this a no-op
-- there while still building it on fresh/local/test databases. Same pattern as
-- the trigram indexes in 0003.
CREATE INDEX IF NOT EXISTS "documents_tags_norm_idx" ON "documents" USING gin (immutable_normalized_tags("tags"));
