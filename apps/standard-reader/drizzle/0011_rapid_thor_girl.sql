ALTER TABLE "user" ADD COLUMN "count_old_posts_as_unread" boolean;
--> statement-breakpoint
-- Backfill existing users to `true` (on) so their current behaviour is preserved
-- exactly: everything a source ever posted counts as unread on subscribe. New
-- users insert with `null`, which resolves to `false` (off) — they only see
-- posts published after they subscribe as new. See
-- src/lib/count-old-posts-as-unread.ts.
UPDATE "user" SET "count_old_posts_as_unread" = true;