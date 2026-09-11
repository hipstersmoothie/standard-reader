-- Language tagging: a derived language per document, and the reader preference
-- that filters network-wide surfaces down to a chosen set of them.
--
-- `site.standard.document` has no language field, so `lang` is detected from
-- indexed text by `src/server/lang/detect.ts` and is ours, not the author's.
-- NULL means the detector had no answer, and a NULL row is never filtered out —
-- see `src/server/reader/language-filters.ts`. `lang_detected_at` is what
-- separates "declined" from "never looked", which is the whole basis of the
-- backfill sweep's work queue.
--
-- Adding the columns is instant (nullable, no default). The two indexes are
-- not: `documents` is ~3.4M rows / ~14 GB, and a plain CREATE INDEX would run
-- inside Railway's `preDeployCommand` with traffic waiting on the lock. Build
-- both CONCURRENTLY on prod out-of-band first via
-- `scripts/document-language-indexes.sql`; IF NOT EXISTS then makes this file a
-- no-op there while still creating them on fresh/local/CI databases. Same
-- pattern as `documents_meta_search_idx` in 0044 and `documents_tags_norm_idx`
-- in 0014.
ALTER TABLE "user" ADD COLUMN "feed_languages" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "lang" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "lang_confidence" double precision;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "lang_detected_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_lang_published_idx" ON "documents" USING btree ("lang","published_at" desc nulls last) WHERE deleted = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_lang_pending_idx" ON "documents" USING btree ("published_at" DESC NULLS LAST) WHERE lang_detected_at is null and deleted = false;
