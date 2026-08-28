-- Search relevance — prod index creation + verification.
--
-- Run this against prod Neon BEFORE merging migration
-- 0044_document_meta_search_idx.sql, and before setting SEARCH_RANKING to
-- anything other than `legacy`. Building CONCURRENTLY avoids a long write-lock
-- on `documents` (~3.4M rows, ~14 GB with indexes); because the migration uses
-- `CREATE INDEX IF NOT EXISTS`, it then no-ops on prod while still building the
-- index on fresh/local/CI databases.
--
-- Ordering matters. If the migration lands first, Railway's `preDeployCommand`
-- builds this index under a lock while the deploy waits on it. If the ranked
-- search path ships first, the title arm has no index to match and degrades to
-- a sequential scan of every document on every keystroke.
--
-- Usage (reads DATABASE_URL from .env — this is a PROD write, run it deliberately):
--   psql "$DATABASE_URL" -f scripts/search-relevance-indexes.sql
-- CONCURRENTLY cannot run inside a transaction, so run this file with psql's
-- default autocommit (do NOT wrap in BEGIN/COMMIT). Expect 20-60 minutes.

-- The title/description/tags half of `documents.search_vector` — see the header
-- of drizzle/0044_document_meta_search_idx.sql for why this is an expression
-- index rather than a generated column. The expression must stay byte-identical
-- to what `documentMetaVectorSql` renders, or the planner silently stops
-- matching it; `document-search.test.ts` guards that.
CREATE INDEX CONCURRENTLY IF NOT EXISTS documents_meta_search_idx
  ON documents USING gin ((
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(immutable_array_to_string(tags), '')), 'B')
  ));

-- A failed CONCURRENTLY build leaves an INVALID index behind, which the planner
-- ignores while it still costs writes. This should return zero rows; if it
-- lists documents_meta_search_idx, DROP INDEX CONCURRENTLY and re-run.
SELECT indexrelid::regclass AS invalid_index
FROM pg_index
WHERE NOT indisvalid;

-- Expect roughly 150-300 MB (8-12 lexemes/row, against 1452 MB for the
-- body-inclusive documents_search_idx).
SELECT pg_size_pretty(pg_relation_size('documents_meta_search_idx')) AS meta_idx_size;

-- ── Verification EXPLAINs (read-only) ────────────────────────────────────────
-- 1. The title arm must be index-served. Expect a Bitmap Index Scan on
-- documents_meta_search_idx and NO Seq Scan on documents. This is the one that
-- decides whether the ranked path is shippable.
EXPLAIN (ANALYZE, BUFFERS)
SELECT d.uri
FROM documents d
WHERE d.deleted = false
  AND (
    setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(d.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(immutable_array_to_string(d.tags), '')), 'B')
  ) @@ websearch_to_tsquery('english', 'Making Feeds: Custom Logic Requests')
LIMIT 400;

-- 2. The whole ranked page for a broad single word — the regression guard for
-- the 16s query. Expect each arm's Bitmap Heap Scan to stop at its cap (rows
-- <= 400) and total execution well under 1500ms.
EXPLAIN (ANALYZE, BUFFERS)
SELECT pool.uri
FROM (
  (SELECT d.uri, d.title, d.description, d.tags, d.published_at
   FROM documents d
   WHERE d.deleted = false
     AND (
       setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
       setweight(to_tsvector('english', coalesce(d.description, '')), 'B') ||
       setweight(to_tsvector('english', coalesce(immutable_array_to_string(d.tags), '')), 'B')
     ) @@ websearch_to_tsquery('english', 'ai')
   LIMIT 400)
  UNION
  (SELECT d.uri, d.title, d.description, d.tags, d.published_at
   FROM documents d
   WHERE d.deleted = false
     AND d.search_vector @@ websearch_to_tsquery('english', 'ai')
   LIMIT 400)
) pool
ORDER BY
  ts_rank('{0.05,0.1,0.4,1.0}'::float4[],
    setweight(to_tsvector('english', coalesce(pool.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(pool.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(immutable_array_to_string(pool.tags), '')), 'B'),
    websearch_to_tsquery('english', 'ai'), 32) DESC,
  pool.published_at DESC, pool.uri DESC
LIMIT 21;

-- 3. Relevance smoke test, not a plan: the article the bug report named must
-- come back first. Expect 'Making Feeds: Custom Logic Requests' in row 1.
SELECT d.title, d.published_at::date,
  CASE
    WHEN lower(btrim(d.title)) = lower(btrim('Making Feeds: Custom Logic Requests')) THEN 7
    WHEN position(lower('Making Feeds: Custom Logic Requests') in lower(d.title)) > 0 THEN 6
    WHEN to_tsvector('simple', coalesce(d.title, ''))
         @@ phraseto_tsquery('simple', 'Making Feeds: Custom Logic Requests') THEN 5
    ELSE 0
  END AS tier
FROM documents d
WHERE d.deleted = false
  AND d.search_vector @@ websearch_to_tsquery('english', 'Making Feeds: Custom Logic Requests')
ORDER BY tier DESC, d.published_at DESC
LIMIT 5;
