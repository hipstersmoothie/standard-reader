ALTER TABLE "user" ADD COLUMN "bsky_labelers_imported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "label_sync_state" ADD COLUMN "stored_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_sync_state" ADD COLUMN "rejected_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_sync_state" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "labeler_services" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "labeler_subscriptions" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;