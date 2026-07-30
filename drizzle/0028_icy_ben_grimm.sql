ALTER TABLE "label_sync_state" ADD COLUMN "stored_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_sync_state" ADD COLUMN "rejected_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "label_sync_state" ADD COLUMN "last_error" text;