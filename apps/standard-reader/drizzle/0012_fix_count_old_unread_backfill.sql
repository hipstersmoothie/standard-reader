-- Corrective backfill: 0011 shipped with an inverted backfill that set every
-- existing user to `false` (off). The intended default is on for pre-existing
-- users (preserve their everything-unread-on-subscribe behaviour) and off only
-- for genuinely new users (who insert with `null`). Flip the erroneously
-- backfilled rows back to `true`. New users keep `null` (→ off) and are
-- untouched. See src/lib/count-old-posts-as-unread.ts.
UPDATE "user" SET "count_old_posts_as_unread" = true WHERE "count_old_posts_as_unread" = false;
