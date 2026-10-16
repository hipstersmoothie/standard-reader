-- The weekly "hottest reads" thread now roots on a Standard Reader page
-- (`/weekly/$week`) and links each article to its canonical URL. The page has
-- to show exactly what the thread posted, and the ranking is relative to
-- `now()`, so the run stamps its picks here before it posts. Additive: rows
-- from before this change keep an empty list and have no page.
ALTER TABLE "weekly_thread_runs" ADD COLUMN "article_uris" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_thread_runs" ADD COLUMN "picked_at" timestamp with time zone;
