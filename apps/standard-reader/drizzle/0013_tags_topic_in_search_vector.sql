-- Fold tags/topic into the full-text search vectors so search matches them.
--
-- `documents.search_vector` gains the free-form `tags` array (weight B) and
-- `publications.search_vector` gains the app-derived `topic` (weight B). Because
-- `websearch_to_tsquery` strips a leading `#`, both `#CCBYSA4` and `CCBYSA4` now
-- surface documents (and publications) carrying that tag/topic, served by the
-- existing GIN indexes with no new query paths.
--
-- Postgres can't ALTER a generated column's expression in place, so each vector
-- is dropped and re-added (which recomputes it for every existing row); the GIN
-- index is dropped with the column and recreated afterward.
-- `array_to_string(anyarray, text)` is only STABLE, so Postgres rejects it inside
-- a generated-column expression (must be IMMUTABLE). Wrap it in an IMMUTABLE
-- helper — for `text[]` the flattening is genuinely immutable — so the vector can
-- fold in `tags` while keeping english normalization (lowercasing/stemming).
CREATE OR REPLACE FUNCTION immutable_array_to_string(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT array_to_string($1, ' ') $$;--> statement-breakpoint
DROP INDEX IF EXISTS "documents_search_idx";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "search_vector";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B') || setweight(to_tsvector('english', coalesce(immutable_array_to_string(tags), '')), 'B') || setweight(to_tsvector('english', coalesce(text_content, '')), 'C')) STORED;--> statement-breakpoint
CREATE INDEX "documents_search_idx" ON "documents" USING gin ("search_vector");--> statement-breakpoint
DROP INDEX IF EXISTS "publications_search_idx";--> statement-breakpoint
ALTER TABLE "publications" DROP COLUMN "search_vector";--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(name, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B') || setweight(to_tsvector('english', coalesce(topic, '')), 'B')) STORED;--> statement-breakpoint
CREATE INDEX "publications_search_idx" ON "publications" USING gin ("search_vector");
