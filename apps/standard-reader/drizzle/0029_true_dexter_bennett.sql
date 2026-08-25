-- Serial publications + the comic reader's page counts.
--
-- Written idempotently on purpose. This branch originally shipped these columns
-- as `0026_pale_thanos` / `0027_rapid_dakota_north`; `main` then landed its own
-- `0026`–`0028`, so the branch's migrations were regenerated on top as this one.
-- Any database that had already run the old numbering — the CI/preview Neon
-- branch had, from earlier runs of this PR — therefore already carries these
-- columns, and a plain `ADD COLUMN` fails there with "column already exists".
-- `IF NOT EXISTS` makes the migration converge from either starting point, and
-- is a no-op on a database (like production) that has never seen them.
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "prev_next_direction" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN IF NOT EXISTS "serial_kind" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "body_image_count" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "publications_serial_idx" ON "publications" USING btree ("prev_next_direction") WHERE deleted = false;
