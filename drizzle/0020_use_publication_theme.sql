-- `IF NOT EXISTS` because this column was applied to production by hand before
-- the migration was renumbered from 0019 to 0020 (0019 went to `big_payback` on
-- main). Production — and every preview branch cut from it — therefore already
-- has the column but has not recorded *this* migration, and drizzle decides what
-- to run by comparing the journal's `when` against the last applied
-- `created_at`. Without this guard the run fails with "column already exists".
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "use_publication_theme" boolean;
