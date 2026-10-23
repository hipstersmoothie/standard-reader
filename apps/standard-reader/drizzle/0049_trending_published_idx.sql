-- Trending's top-k index: `ORDER BY trending_score DESC NULLS LAST,
-- published_at DESC NULLS LAST LIMIT k` (`trendingOrder` in
-- src/server/reader/queries.ts). Without it the Trending page read and
-- disk-sorted every document in the 4-day window (~60k rows, ~400 MB) to return
-- 30: 0.5s warm, 7s cold. With it: ~2ms.
--
-- Built CONCURRENTLY on prod out of band before this shipped (21s, 126 MB), so
-- IF NOT EXISTS makes this a no-op there while still creating it on fresh, local
-- and CI databases — same pattern as 0044 and 0014.
CREATE INDEX IF NOT EXISTS "documents_trending_published_idx" ON "documents" USING btree ("trending_score" desc nulls last,"published_at" desc nulls last) WHERE deleted = false;
