-- Language tagging — prod index creation + verification.
--
-- Run this against prod Neon BEFORE merging migration
-- 0047_document_languages.sql. Building CONCURRENTLY avoids a long write-lock
-- on `documents` (~3.4M rows, ~14 GB with indexes); because the migration uses
-- `CREATE INDEX IF NOT EXISTS`, it then no-ops on prod while still building the
-- indexes on fresh/local/CI databases.
--
-- The columns themselves are added by the migration and are instant (nullable,
-- no default), so they do not need the same treatment — but the indexes
-- reference them, so the ALTERs below are repeated here (IF NOT EXISTS) to
-- let this file run first.
--
-- Usage (reads DATABASE_URL from .env — this is a PROD write, run it
-- deliberately):
--   psql "$DATABASE_URL" -f scripts/document-language-indexes.sql
-- CONCURRENTLY cannot run inside a transaction, so run this file with psql's
-- default autocommit (do NOT wrap in BEGIN/COMMIT). Expect 10-30 minutes.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS lang text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS lang_confidence double precision;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS lang_source text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS lang_detected_at timestamptz;

-- Serves `lang IS NULL OR lang IN (…)` on the language-filtered network
-- surfaces. btree indexes NULLs, so both arms come from here and the planner
-- BitmapOrs them rather than falling back to a sequential scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_lang_published_idx
  ON documents USING btree (lang, published_at DESC NULLS LAST)
  WHERE deleted = false;

-- The detection sweep's work queue. Partial on the undetected rows so it
-- shrinks toward nothing as the backfill lands, instead of carrying the whole
-- corpus forever.
CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_lang_pending_idx
  ON documents USING btree (published_at DESC NULLS LAST)
  WHERE lang_detected_at IS NULL AND deleted = false;

-- The Jev tiebreak's work queue: documents GlotLID wasn't sure of (~2%).
CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_lang_tiebreak_idx
  ON documents USING btree (published_at DESC NULLS LAST)
  WHERE lang_source = 'glotlid-unsure' AND deleted = false;

-- A failed CONCURRENTLY build leaves an INVALID index behind, which the planner
-- ignores while it still costs writes. This should return zero rows; if it
-- lists any index above, DROP INDEX CONCURRENTLY and re-run.
SELECT indexrelid::regclass AS invalid_index
FROM pg_index
WHERE NOT indisvalid;

SELECT pg_size_pretty(pg_relation_size('documents_lang_published_idx')) AS lang_idx_size,
       pg_size_pretty(pg_relation_size('documents_lang_pending_idx')) AS pending_idx_size,
       pg_size_pretty(pg_relation_size('documents_lang_tiebreak_idx')) AS tiebreak_idx_size;

-- ── Verification EXPLAINs (read-only) ────────────────────────────────────────
-- 1. A language-filtered Latest "All" page. Expect the lang predicate to be
-- index-served (Bitmap Index Scan / BitmapOr on documents_lang_published_idx)
-- and NO Seq Scan on documents.
EXPLAIN (ANALYZE, BUFFERS)
SELECT d.uri
FROM documents d
WHERE d.deleted = false
  AND d.published_at <= now()
  AND (d.lang IS NULL OR d.lang IN ('en', 'ja'))
ORDER BY d.published_at DESC
LIMIT 21;

-- 2. The sweep's work queue. Expect an Index Scan on documents_lang_pending_idx
-- with rows <= the batch size, and buffer counts that do not grow with the
-- corpus once the backfill has run.
EXPLAIN (ANALYZE, BUFFERS)
SELECT d.uri
FROM documents d
WHERE d.deleted = false
  AND d.lang_detected_at IS NULL
ORDER BY d.published_at DESC
LIMIT 500;

-- 3. Coverage, once the backfill has run: how much of the corpus is tagged, and
-- with what. A large `untagged` share is expected and fine (bridged link posts
-- carry almost no prose); a large share in one unexpected language is a signal
-- the detector or its vocabulary needs a look.
SELECT coalesce(lang, '(untagged)') AS lang,
       count(*) AS documents,
       round(100.0 * count(*) / sum(count(*)) OVER (), 2) AS pct
FROM documents
WHERE deleted = false
GROUP BY 1
ORDER BY documents DESC
LIMIT 25;
