-- Re-applies the columns added by 0026_mixed_robin_chapel, 0027_friendly_iron_monger
-- and 0028_living_susan_delgado, idempotently.
--
-- Those three arrived on main while this branch carried migrations of its own.
-- Drizzle's migrator only runs journal entries newer than the newest row in
-- `__drizzle_migrations`, and this branch's earlier migrations were applied to
-- the shared preview database with timestamps *later* than all three — so from
-- that database's point of view they are already in the past and will never be
-- applied. The columns are therefore missing wherever that happened, and every
-- query touching `profiles.is_bot` fails.
--
-- `IF NOT EXISTS` throughout: on a database that did run them (production, any
-- fresh one) this is a no-op.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "bsky_labelers_imported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "label_sync_state" ADD COLUMN IF NOT EXISTS "stored_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_sync_state" ADD COLUMN IF NOT EXISTS "rejected_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_sync_state" ADD COLUMN IF NOT EXISTS "last_error" text;--> statement-breakpoint
ALTER TABLE "labeler_services" ADD COLUMN IF NOT EXISTS "handle" text;--> statement-breakpoint
ALTER TABLE "labeler_subscriptions" ADD COLUMN IF NOT EXISTS "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "labeler_services" ADD COLUMN IF NOT EXISTS "labels_standard_site" boolean;--> statement-breakpoint
ALTER TABLE "labeler_services" ADD COLUMN IF NOT EXISTS "labels_probed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "labeler_services" ADD COLUMN IF NOT EXISTS "reachable" boolean;
