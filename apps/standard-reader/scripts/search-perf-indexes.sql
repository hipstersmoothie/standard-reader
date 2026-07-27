-- Search performance (Phase A) — prod index creation + verification.
--
-- Run these against prod Neon BEFORE deploying migration 0003_ambiguous_harrier.sql.
-- Creating the trigram indexes CONCURRENTLY avoids a long write-lock on
-- `documents`; because the migration uses `CREATE INDEX IF NOT EXISTS`, it then
-- no-ops on prod while still building the indexes on fresh/local/test DBs.
--
-- Usage (reads DATABASE_URL from .env — this is a PROD write, run it deliberately):
--   psql "$DATABASE_URL" -f scripts/search-perf-indexes.sql
-- CONCURRENTLY cannot run inside a transaction, so run this file with psql's
-- default autocommit (do NOT wrap in BEGIN/COMMIT).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_handle_trgm_idx
  ON profiles USING gin (handle gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS profiles_display_name_trgm_idx
  ON profiles USING gin (display_name gin_trgm_ops);

-- Largest table — build this one last.
CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_canonical_url_trgm_idx
  ON documents USING gin (canonical_url gin_trgm_ops);

-- A failed CONCURRENTLY build leaves an INVALID index behind. This should
-- return zero rows; if it lists one of the above, DROP it and re-run.
SELECT indexrelid::regclass AS invalid_index
FROM pg_index
WHERE NOT indisvalid;

-- ── Verification EXPLAINs (read-only) ────────────────────────────────────────
-- Confirm the author pre-resolution lookup uses the trigram indexes (expect a
-- Bitmap Index Scan on profiles_handle_trgm_idx / profiles_display_name_trgm_idx,
-- not a Seq Scan on profiles):
EXPLAIN (ANALYZE, BUFFERS)
SELECT pr.did, p.uri
FROM profiles pr
LEFT JOIN publications p ON p.did = pr.did AND p.deleted = false
WHERE (pr.handle ILIKE '%climate%' OR pr.display_name ILIKE '%climate%')
LIMIT 50;

-- Confirm the article match predicate is documents-only and index-served (expect
-- a BitmapOr over documents_search_idx plus, when the IN lists are non-empty,
-- documents_did_idx / documents_publication_published_idx — no Seq Scan on
-- documents, and ts_headline only in the outermost projection):
EXPLAIN (ANALYZE, BUFFERS)
SELECT page.uri,
       ts_headline('english', coalesce(page.title, ''),
         websearch_to_tsquery('english', 'climate')) AS title_html
FROM (
  SELECT d.uri, d.title
  FROM documents d
  LEFT JOIN publications p ON p.uri = d.publication_uri
  WHERE d.deleted = false
    AND d.search_vector @@ websearch_to_tsquery('english', 'climate')
    AND (p.uri IS NULL OR p.url NOT ILIKE '%blento.app%')
  ORDER BY ts_rank(d.search_vector, websearch_to_tsquery('english', 'climate')) DESC,
           d.published_at DESC
  LIMIT 21 OFFSET 0
) page;
